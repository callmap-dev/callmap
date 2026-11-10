import { readArguments } from './arguments.ts';
import type { Distribution } from './distribution.ts';
import { runReview } from './review-command.ts';

export const runCommand = async (distribution: Distribution): Promise<void> => {
  try {
    const { out, notes } = await runReview(
      readArguments(process.argv.slice(2), process.cwd(), distribution.command),
      distribution,
    );
    for (const note of notes) process.stderr.write(`${note}\n`);
    process.stdout.write(`${out}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
};
