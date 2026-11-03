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
| `agent:in-progress`    | set by the workflow     | An agent works on the issue or the PR now.                                             |
| `agent:blocked`        | set by the workflow     | The last agent run failed. The comment gives the reason. Put the label again to retry. |

`agent:implement-spec` skips a ticket with the `ready-for-human` label. It also skips a ticket that waits on an open blocker that the run did not build. The spec gets a comment that names each skipped ticket.
