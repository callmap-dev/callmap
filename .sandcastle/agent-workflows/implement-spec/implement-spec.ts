import * as path from 'node:path';
import * as sandcastle from '@ai-hero/sandcastle';
import { noSandbox } from '@ai-hero/sandcastle/sandboxes/no-sandbox';
import {
  claudeAgent,
  fail,
  fetchIssueText,
  gh,
  required,
  sh,
  workflowEditReason,
  workflowFilesTouchedSince,
  writeJson,
  writeText,
} from '../shared/common';
import { config } from '../../sandcastle.config';

const SPEC_NUMBER = required('SPEC_NUMBER');
const SPEC_TITLE = required('SPEC_TITLE');
const BRANCH = required('BRANCH');

const HUMAN_LABEL = 'ready-for-human';

interface Ticket {
  readonly number: number;
  readonly title: string;
  readonly labels: string[];
  readonly openBlockers: number[];
  readonly text: string;
}

interface SkippedTicket {
  readonly number: number;
  readonly title: string;
  readonly reason: string;
}

const fetchOpenTickets = (): Ticket[] => {
  const subIssues = JSON.parse(
    gh(['api', '--paginate', '--slurp', `repos/${config.repo}/issues/${SPEC_NUMBER}/sub_issues`]),
  ) as {
    number: number;
    title: string;
    state: string;
    labels: { name: string }[];
  }[][];

  return subIssues
    .flat()
    .filter((issue) => issue.state === 'open')
    .map((issue) => ({
      number: issue.number,
      title: issue.title,
      labels: issue.labels.map((label) => label.name),
      openBlockers: fetchOpenBlockers(issue.number),
      text: fetchIssueText(String(issue.number)) || `Issue #${issue.number}: ${issue.title}`,
    }));
};

const fetchOpenBlockers = (issueNumber: number): number[] => {
  try {
    const blockers = JSON.parse(
      gh(['api', `repos/${config.repo}/issues/${issueNumber}/dependencies/blocked_by`]),
    ) as { number: number; state: string }[];
    return blockers.filter((blocker) => blocker.state === 'open').map((blocker) => blocker.number);
  } catch {
    return [];
  }
};

const headSha = (): string => sh('git rev-parse HEAD').trim();

const prBody = (done: Ticket[], skipped: SkippedTicket[], allDone: boolean): string => {
  const lines = [
    allDone ? `Closes #${SPEC_NUMBER}` : `Part of #${SPEC_NUMBER}`,
    '',
    ...done.map((ticket) => `Closes #${ticket.number}`),
  ];
  if (skipped.length > 0) {
    lines.push('', 'Tickets that this run did not build:', '');
    lines.push(...skipped.map((ticket) => `- #${ticket.number} ${ticket.title}: ${ticket.reason}`));
  }
  return lines.join('\n') + '\n';
};

try {
  const specContext = fetchIssueText(SPEC_NUMBER) || `Issue #${SPEC_NUMBER}: ${SPEC_TITLE}`;
  const tickets = fetchOpenTickets();

  if (tickets.length === 0) {
    fail(`Spec #${SPEC_NUMBER} has no open sub-issues to build.`);
  }

  // noSandbox forwards process.env to the agent; drop the write-scope GitHub token
  // so injected issue text cannot direct the agent to use it. All gh reads are
  // done, and the checkout sets persist-credentials: false so it is not in
  // .git/config either.
  delete process.env.GH_TOKEN;
  delete process.env.GITHUB_TOKEN;

  const ticketNumbers = new Set(tickets.map((ticket) => ticket.number));
  const done: Ticket[] = [];
  const skipped: SkippedTicket[] = [];
  const doneNumbers = new Set<number>();
  let stopReason = '';

  for (const ticket of tickets) {
    if (stopReason) {
      skipped.push({ ...ticket, reason: stopReason });
      continue;
    }
    if (ticket.labels.includes(HUMAN_LABEL)) {
      skipped.push({ ...ticket, reason: `it has the \`${HUMAN_LABEL}\` label` });
      continue;
    }
    const waitingOn = ticket.openBlockers.filter((blocker) => !doneNumbers.has(blocker));
    if (waitingOn.length > 0) {
      const outside = waitingOn.filter((n) => !ticketNumbers.has(n));
      skipped.push({
        ...ticket,
        reason: `it is blocked by ${waitingOn.map((n) => `#${n}`).join(', ')}${
          outside.length > 0 ? ', which this spec does not hold' : ''
        }`,
      });
      continue;
    }

    const before = headSha();
    console.log(`\n=== Ticket #${ticket.number}: ${ticket.title}`);
    try {
      await sandcastle.run({
        name: `implement-spec-#${SPEC_NUMBER}-#${ticket.number}`,
        agent: claudeAgent(),
        sandbox: noSandbox(),
        logging: { type: 'stdout' },
        promptFile: path.join(import.meta.dirname, 'prompt.md'),
        promptArgs: {
          SPEC_NUMBER,
          SPEC_TITLE,
          SPEC_CONTEXT: specContext,
          TICKET_NUMBER: String(ticket.number),
          TICKET_TITLE: ticket.title,
          TICKET_CONTEXT: ticket.text,
          DONE_TICKETS: done.map((t) => `- #${t.number} ${t.title}`).join('\n') || '(none yet)',
          BRANCH,
        },
      });
    } catch (error) {
      stopReason = `the run stopped at #${ticket.number}`;
      skipped.push({
        ...ticket,
        reason: `the agent failed: ${error instanceof Error ? error.message : String(error)}`,
      });
      continue;
    }

    if (sh('git status --porcelain').trim() !== '') {
      sh('git reset --hard HEAD');
      sh('git clean -fd');
    }
    if (headSha() === before) {
      stopReason = `the run stopped at #${ticket.number}`;
      skipped.push({ ...ticket, reason: 'the agent made no commit' });
      continue;
    }
    const workflowFiles = workflowFilesTouchedSince(before);
    if (workflowFiles.length > 0) {
      sh(`git reset --hard ${before}`);
      skipped.push({ ...ticket, reason: workflowEditReason(workflowFiles) });
      continue;
    }
    done.push(ticket);
    doneNumbers.add(ticket.number);
  }

  writeJson('spec_result.json', {
    done: done.map(({ number, title }) => ({ number, title })),
    skipped,
  });
  writeText('pr-body.md', prBody(done, skipped, skipped.length === 0));

  if (done.length === 0) {
    fail(
      `No ticket of spec #${SPEC_NUMBER} was built. ${skipped
        .map((t) => `#${t.number}: ${t.reason}.`)
        .join(' ')}`,
    );
  }

  console.log(`Built ${done.length} ticket(s), skipped ${skipped.length} ticket(s).`);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
