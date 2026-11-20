import { asArray, asBoolean, asOptionalString, asRecord, asString, standardSchema } from './common';

export interface InlineComment {
  readonly path: string;
  readonly line: number;
  readonly body: string;
}

export interface ThreadReply {
  readonly commentId: string;
  readonly body: string;
}

export interface ReviewOutput {
  readonly summary: string;
  readonly specConformant: boolean;
  readonly unmetCriteria: string[];
  readonly needsChanges: boolean;
  readonly riskAboveIssue: string;
  readonly inlineComments: InlineComment[];
  readonly replies: ThreadReply[];
}

export const VERDICTS = ['confirmed', 'refuted', 'pre-existing'] as const;

export type Verdict = (typeof VERDICTS)[number];

export interface ClaimVerdict {
  readonly claim: number;
  readonly verdict: Verdict;
  readonly evidence: string;
}

export interface VerifierOutput {
  readonly verdicts: ClaimVerdict[];
}

export interface ImplementPrOutput {
  readonly threadReplies: ThreadReply[];
  readonly newInlineComments: InlineComment[];
  readonly topLevelComments: { readonly body: string }[];
}

const parseLine = (value: unknown, record: Record<string, unknown>): number => {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }
  const lineRange = asOptionalString(record.lineRange);
  const firstLine = lineRange?.match(/\d+/)?.[0];
  if (firstLine) {
    return Number(firstLine);
  }
  throw new Error('line must be a positive integer or lineRange must start with a line number');
};

const parseInlineComment = (value: unknown): InlineComment => {
  const record = asRecord(value, 'inline comment');
  return {
    path: asString(record.path ?? record.file, 'inline comment path'),
    line: parseLine(record.line, record),
    body: asString(record.body ?? record.comment, 'inline comment body'),
  };
};

const parseReply = (value: unknown): ThreadReply => {
  const record = asRecord(value, 'reply');
  return {
    commentId: asString(record.commentId, 'reply commentId'),
    body: asString(record.body ?? record.comment, 'reply body'),
  };
};

export const reviewOutputSchema = standardSchema<ReviewOutput>((value) => {
  const record = asRecord(value, 'review output');
  const inlineComments = asArray(record.inlineComments ?? [], 'inlineComments').map(
    parseInlineComment,
  );
  return {
    summary: asString(record.summary, 'summary'),
    specConformant: asBoolean(record.specConformant, 'specConformant'),
    unmetCriteria: asArray(record.unmetCriteria ?? [], 'unmetCriteria').map((criterion) =>
      asString(criterion, 'unmet criterion'),
    ),
    needsChanges:
      record.needsChanges === undefined
        ? inlineComments.length > 0
        : asBoolean(record.needsChanges, 'needsChanges'),
    riskAboveIssue: asOptionalString(record.riskAboveIssue) ?? '',
    inlineComments,
    replies: asArray(record.replies ?? [], 'replies').map(parseReply),
  };
});

export const implementPrOutputSchema = standardSchema<ImplementPrOutput>((value) => {
  const record = asRecord(value, 'implement PR output');
  return {
    threadReplies: asArray(record.threadReplies ?? [], 'threadReplies').map(parseReply),
    newInlineComments: asArray(record.newInlineComments ?? [], 'newInlineComments').map(
      parseInlineComment,
    ),
    topLevelComments: asArray(record.topLevelComments ?? [], 'topLevelComments').map((comment) => ({
      body: asString(asRecord(comment, 'top-level comment').body, 'body'),
    })),
  };
});

const parseVerdict = (value: unknown): ClaimVerdict => {
  const record = asRecord(value, 'verdict');
  const claim = record.claim;
  if (typeof claim !== 'number' || !Number.isInteger(claim) || claim < 1) {
    throw new Error('verdict claim must be a positive integer');
  }
  const verdict = asString(record.verdict, 'verdict verdict');
  if (!VERDICTS.includes(verdict as Verdict)) {
    throw new Error(`verdict must be one of ${VERDICTS.join(', ')}`);
  }
  return {
    claim,
    verdict: verdict as Verdict,
    evidence: asString(record.evidence, 'verdict evidence'),
  };
};

export const verifierOutputSchema = standardSchema<VerifierOutput>((value) => ({
  verdicts: asArray(asRecord(value, 'verifier output').verdicts, 'verdicts').map(parseVerdict),
}));

export const filterInlineComments = (
  comments: readonly InlineComment[],
  diffLines: Map<string, Set<number>>,
): InlineComment[] =>
  comments.filter((comment) => {
    const fileLines = diffLines.get(comment.path);
    if (!fileLines) {
      console.warn(
        `Dropping inline comment for ${comment.path}:${comment.line}; file is not in the diff.`,
      );
      return false;
    }
    if (!fileLines.has(comment.line)) {
      console.warn(
        `Dropping inline comment for ${comment.path}:${comment.line}; line is not in the diff hunks.`,
      );
      return false;
    }
    return true;
  });

export const filterReplies = (
  replies: readonly ThreadReply[],
  validReplyIds: Set<string>,
): ThreadReply[] =>
  replies.filter((reply) => {
    if (!validReplyIds.has(reply.commentId)) {
      console.warn(
        `Dropping reply for commentId=${reply.commentId}; it was not in fetched unresolved threads.`,
      );
      return false;
    }
    return true;
  });
