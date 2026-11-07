# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

Edit the right-hand column to match whatever vocabulary you actually use.

## Agent workflow labels

These labels start the Sandcastle agents in GitHub Actions. The workflows are `.github/workflows/agent-*.yml`, and their scripts are in `.sandcastle/agent-workflows/`. Only a collaborator can put a label on an issue or a PR, so only a collaborator can start an agent.

| Label                  | Put it on               | What the agent does                                                                    |
| ---------------------- | ----------------------- | -------------------------------------------------------------------------------------- |
| `agent:explore`        | an issue                | Reads the code and posts a comment that explores the issue.                            |
| `agent:implement`      | a standalone issue      | Builds the issue on `issue/<number>-<slug>` and opens a PR.                            |
| `agent:implement`      | a PR                    | Answers the review comments of the PR and pushes the fixes.                            |
| `agent:implement-spec` | a spec with sub-issues  | Builds each open ticket in order on `spec/<number>-<slug>` and opens one PR.           |
| `agent:review`         | a PR                    | Checks the PR against its issue, commits fixes and posts a review.                     |
| `agent:update-branch`  | a PR                    | Merges the base branch into the PR branch and fixes the conflicts.                     |
| `agent:auto`           | an issue or a spec      | Builds it like `agent:implement` or `agent:implement-spec`, then runs the loop below.  |
| `agent:auto`           | a PR                    | Runs the loop below from the review. Remove the label to stop the loop.                |
| `agent:ready`          | set by the workflow     | The loop is green. The PR waits for a human review and the merge.                      |
| `agent:in-progress`    | set by the workflow     | An agent works on the issue or the PR now.                                             |
| `agent:blocked`        | set by the workflow     | The last agent run failed. The comment gives the reason. Put the label again to retry. |

The `agent:auto` loop runs review and fix in turns. After each review, `.sandcastle/agent-workflows/auto/continue.sh` waits for the `ci.yml` run on the new head. The PR is green when CI passes, the review finds every acceptance criterion met, and the review asks for no code change. A green PR gets `agent:ready`. Otherwise the loop posts a round comment with the unmet criteria and the failed CI log, and puts `agent:implement` on the PR. After 3 fix rounds the PR gets `agent:blocked`. The repo variables `AGENT_CI_WORKFLOW` and `AGENT_AUTO_MAX_ROUNDS` change the CI workflow and the round limit.

`agent:implement-spec` skips a ticket with the `ready-for-human` label. It also skips a ticket that waits on an open blocker that the run did not build. The spec gets a comment that names each skipped ticket.
