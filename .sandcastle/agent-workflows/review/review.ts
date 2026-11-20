import * as fs from 'node:fs';
import * as path from 'node:path';
import * as sandcastle from '@ai-hero/sandcastle';
import { noSandbox } from '@ai-hero/sandcastle/sandboxes/no-sandbox';
import { claudeAgent, fail, required, safeSh, sh, writeJson, writeText } from '../shared/common';
import { currentDiffLines, fetchPullRequestContext, REVIEW_MARKER } from '../shared/review-context';
import {
  filterInlineComments,
  filterReplies,
  reviewOutputSchema,
  verifierOutputSchema,
  type InlineComment,
  type Verdict,
} from '../shared/review-output';
import { runWithExtraction } from '../shared/run-with-extraction';
import { config } from '../../sandcastle.config';

const PR_NUMBER = required('PR_NUMBER');
const BRANCH = required('BRANCH');

const deltaScope = (lastReviewedCommit: string): string =>
  lastReviewedCommit
    ? [
        `An earlier review of this PR passed commit \`${lastReviewedCommit}\`, so this is a delta review.`,
        `Report only a finding on a line that changed after it, or a defect that such a line causes. Run \`git diff ${lastReviewedCommit}..HEAD\` to see those lines.`,
        'Do not look again at lines that the earlier review passed. The acceptance criteria check still covers the whole issue.',
      ].join(' ')
    : 'This is the first review of the branch, or the branch changed its history after the last review. Review the whole diff.';

interface VerifiedComment {
  readonly comment: InlineComment;
  readonly verdict: Verdict;
  readonly evidence: string;
}

const verifyComments = async (comments: readonly InlineComment[]): Promise<VerifiedComment[]> => {
  const before = sh('git rev-parse HEAD').trim();
  const fixedPoint = safeSh(`git merge-base ${config.base} HEAD`).trim() || config.base;
  const claims = comments
    .map((comment, index) => `${index + 1}. \`${comment.path}:${comment.line}\`: ${comment.body}`)
    .join('\n\n');
  try {
    const result = await runWithExtraction({
      name: `review-pr-${PR_NUMBER}-verify`,
      agent: claudeAgent(),
      sandbox: noSandbox(),
      logging: { type: 'stdout' },
      promptFile: path.join(import.meta.dirname, 'verify-prompt.md'),
      promptArgs: { PR_NUMBER, BRANCH, FIXED_POINT: fixedPoint, CLAIMS: claims },
      output: sandcastle.Output.object({ tag: 'output', schema: verifierOutputSchema }),
      extractionPrompt: fs.readFileSync(
        path.join(import.meta.dirname, 'verify-extraction.md'),
        'utf8',
      ),
    });
    const byClaim = new Map(result.output.verdicts.map((verdict) => [verdict.claim, verdict]));
    return comments.map((comment, index): VerifiedComment => {
      const verdict = byClaim.get(index + 1);
      return verdict
        ? { comment, verdict: verdict.verdict, evidence: verdict.evidence }
        : { comment, verdict: 'confirmed', evidence: 'The verifier gave no verdict.' };
    });
  } finally {
    // The verifier is read-only; undo anything it left so the push carries only the review.
    sh(`git reset --hard ${before}`);
    sh('git clean -fd');
  }
};

try {
  const context = fetchPullRequestContext(PR_NUMBER);

  // noSandbox forwards process.env to the agent; drop the write-scope GitHub token
  // so injected PR or issue text cannot direct the agent to use it. All gh reads
  // are done, and the checkout sets persist-credentials: false so it is not in
  // .git/config either.
  delete process.env.GH_TOKEN;
  delete process.env.GITHUB_TOKEN;

  const result = await runWithExtraction({
    name: `review-pr-${PR_NUMBER}`,
    agent: claudeAgent(),
    sandbox: noSandbox(),
    logging: { type: 'stdout' },
    promptFile: path.join(import.meta.dirname, 'prompt.md'),
    promptArgs: {
      PR_NUMBER,
      BRANCH,
      PR_TITLE: context.prTitle,
      ISSUE_NUMBER: context.issueNumber || '(none)',
      ISSUE_TITLE: context.issueTitle || '(no linked issue)',
      LINKED_ISSUE: context.linkedIssue,
      DIFF_TO_MAIN: context.diff,
      PR_COMMENTS_JSON: context.prCommentsJson,
      DELTA_SCOPE: deltaScope(context.lastReviewedCommit),
    },
    output: sandcastle.Output.object({
      tag: 'output',
      schema: reviewOutputSchema,
    }),
    extractionPrompt: fs.readFileSync(path.join(import.meta.dirname, 'extraction.md'), 'utf8'),
  });

  // The agent may have committed, shifting line numbers; validate against the
  // post-run diff, which matches the commit_id the review is posted against.
  const validInlineComments = filterInlineComments(
    result.output.inlineComments,
    currentDiffLines(),
  );
  const validReplies = filterReplies(result.output.replies, context.validReplyIds);

  let verifierLine = 'Verifier: no inline comments to check.';
  let verified: VerifiedComment[] = validInlineComments.map((comment) => ({
    comment,
    verdict: 'confirmed',
    evidence: '',
  }));
  if (validInlineComments.length > 0) {
    try {
      verified = await verifyComments(validInlineComments);
      const count = (verdict: Verdict) =>
        verified.filter((item) => item.verdict === verdict).length;
      verifierLine = `Verifier: ${count('confirmed')} confirmed, ${count('refuted')} refuted, ${count('pre-existing')} pre-existing.`;
    } catch (error) {
      verifierLine = `Verifier: failed, so every inline comment stays. ${
        error instanceof Error ? error.message : String(error)
      }`;
    }
  }
  const confirmedComments = verified
    .filter((item) => item.verdict === 'confirmed')
    .map((item) => item.comment);
  const refuted = verified.filter((item) => item.verdict === 'refuted');
  const needsChanges = result.output.needsChanges && confirmedComments.length > 0;
  const headSha = sh('git rev-parse HEAD').trim();

  // Surface a failed spec check at the top of the posted review so the human
  // merge gate cannot miss it; the summary alone proved glossable in practice.
  const reviewBody = [
    ...(result.output.riskAboveIssue ? [`**Risk:** ${result.output.riskAboveIssue}`, ''] : []),
    ...(result.output.specConformant
      ? []
      : [
          '**Spec conformance: FAILED.** Unmet acceptance criteria from the linked issue:',
          ...result.output.unmetCriteria.map((criterion) => `- ${criterion}`),
          '',
        ]),
    result.output.summary,
    '',
    verifierLine,
    ...(refuted.length > 0
      ? [
          '',
          'Dismissed, refuted by the verifier:',
          ...refuted.map(
            (item) => `- \`${item.comment.path}:${item.comment.line}\`: ${item.evidence}`,
          ),
        ]
      : []),
    '',
    REVIEW_MARKER,
  ].join('\n');

  writeJson('review_payload.json', {
    commit_id: headSha,
    event: 'COMMENT',
    body: reviewBody,
    comments: confirmedComments.map((comment) => ({
      path: comment.path,
      line: comment.line,
      side: 'RIGHT',
      body: comment.body,
    })),
  });
  writeJson('replies.json', validReplies);
  writeJson('verdict.json', {
    specConformant: result.output.specConformant,
    unmetCriteria: result.output.unmetCriteria,
    needsChanges,
    riskAboveIssue: result.output.riskAboveIssue,
  });
  writeText('summary.md', reviewBody);

  console.log('Review complete.');
  console.log(`Spec conformant: ${result.output.specConformant}.`);
  console.log(`Needs changes: ${needsChanges}.`);
  console.log(`Commits: ${result.commits.length}.`);
  console.log(`Inline comments: ${confirmedComments.length} of ${validInlineComments.length}.`);
  console.log(verifierLine);
  console.log(`Replies: ${validReplies.length}.`);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
