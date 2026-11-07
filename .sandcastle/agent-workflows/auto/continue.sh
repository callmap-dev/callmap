#!/usr/bin/env bash
# Decides the next step of the agent:auto loop after a review run.
# The loop is ready when CI passes, the spec is met and the review left no
# change request. Otherwise it hands the PR to the fix agent, up to MAX_ROUNDS.
#
# Env: PR_NUMBER, GH_REPO, GH_TOKEN (read and comment), AGENT_PAT (labels that
# must start the next workflow), VERDICT (verdict.json of review.ts),
# TRIGGER_LABEL, CI_WORKFLOW, MAX_ROUNDS, CI_TIMEOUT_MINUTES, RUNNER_TEMP,
# GITHUB_WORKSPACE.
set -euo pipefail

START='<!-- agent:auto start -->'
ROUND='<!-- agent:auto round -->'
MAX_ROUNDS="${MAX_ROUNDS:-3}"
CI_TIMEOUT_MINUTES="${CI_TIMEOUT_MINUTES:-30}"
body_file="${RUNNER_TEMP}/auto-loop-comment.md"

labels=$(gh pr view "$PR_NUMBER" --json labels --jq '[.labels[].name] | join(",")')
case ",$labels," in
  *,agent:auto,*) ;;
  *) echo "The PR has no agent:auto label, so the loop is off."; exit 0 ;;
esac

ensure_label() {
  GH_TOKEN="${AGENT_PAT:-$GH_TOKEN}" gh label create "$1" --color "$2" --description "$3" 2>/dev/null || true
}

stop_loop() {
  local label="$1" text="$2"
  ensure_label "$label" "$3" "$4"
  gh pr edit "$PR_NUMBER" --remove-label "agent:auto" --add-label "$label"
  { printf '%s\n' "$header"; printf '%s\n' "$text"; } > "$body_file"
  gh pr comment "$PR_NUMBER" --body-file "$body_file"
}

header=""
rounds=0
if [ "${TRIGGER_LABEL:-}" = "agent:auto" ]; then
  header="$START"
else
  rounds=$(gh api "repos/${GH_REPO}/issues/${PR_NUMBER}/comments" --paginate --jq '.[].body' \
    | awk -v s="$START" -v r="$ROUND" 'index($0, s) { n = 0 } index($0, r) { n++ } END { print n + 0 }')
fi

if [ -z "${AGENT_PAT:-}" ]; then
  stop_loop "agent:blocked" "The \`agent:auto\` loop stopped: the \`AGENT_PAT\` secret is not set. A label that \`GITHUB_TOKEN\` adds cannot start the next workflow." D73A4A "The last agent run failed"
  exit 0
fi

head=$(git rev-parse HEAD)
ci_state=none
ci_run=""
if [ -n "${CI_WORKFLOW:-}" ] && [ -f "${GITHUB_WORKSPACE}/.github/workflows/${CI_WORKFLOW}" ]; then
  deadline=$(( $(date +%s) + CI_TIMEOUT_MINUTES * 60 ))
  first_seen_deadline=$(( $(date +%s) + 300 ))
  while :; do
    run=$(gh run list --workflow "$CI_WORKFLOW" --commit "$head" --limit 1 --json databaseId,status,conclusion --jq 'first // empty')
    if [ -n "$run" ]; then
      ci_run=$(jq -r .databaseId <<<"$run")
      if [ "$(jq -r .status <<<"$run")" = completed ]; then
        [ "$(jq -r .conclusion <<<"$run")" = success ] && ci_state=success || ci_state=failure
        break
      fi
    elif [ "$(date +%s)" -gt "$first_seen_deadline" ]; then
      ci_state=none
      break
    fi
    if [ "$(date +%s)" -gt "$deadline" ]; then
      ci_state=timeout
      break
    fi
    sleep 30
  done
fi
echo "CI on ${head}: ${ci_state}"

spec=$(jq -r .specConformant "$VERDICT")
needs=$(jq -r .needsChanges "$VERDICT")

if [ "$ci_state" != failure ] && [ "$ci_state" != timeout ] && [ "$spec" = true ] && [ "$needs" = false ]; then
  ci_text="CI passed"
  [ "$ci_state" = none ] && ci_text="No \`${CI_WORKFLOW:-CI}\` run found for this commit"
  stop_loop "agent:ready" "Ready for a human review after $rounds fix rounds. ${ci_text}, the spec is met, and the review has no open change request." 1D76DB "The agent loop is green and waits for a human review"
  exit 0
fi

if [ "$rounds" -ge "$MAX_ROUNDS" ]; then
  stop_loop "agent:blocked" "The \`agent:auto\` loop stopped after $rounds fix rounds and is still not green. CI: ${ci_state}. Spec met: ${spec}. Open change request: ${needs}. Read the last review, then add \`agent:auto\` again or fix it by hand." D73A4A "The last agent run failed"
  exit 0
fi

next=$((rounds + 1))
{
  printf '%s\n%s\n' "$header" "$ROUND"
  printf 'Round %s of %s of the `agent:auto` loop. The fix agent gets this PR because:\n\n' "$next" "$MAX_ROUNDS"
  if [ "$spec" != true ]; then
    printf -- '- **Spec:** these acceptance criteria are not met:\n'
    jq -r '.unmetCriteria[] | "  - " + .' "$VERDICT"
  fi
  [ "$needs" = true ] && printf -- '- **Review:** the last review asks for code changes. Fix its comments.\n'
  [ "$ci_state" = timeout ] && printf -- '- **CI:** the `%s` run did not finish in %s minutes.\n' "$CI_WORKFLOW" "$CI_TIMEOUT_MINUTES"
  if [ "$ci_state" = failure ]; then
    printf -- '- **CI:** the `%s` run failed. Fix the cause. The failed log ends with:\n\n```text\n' "$CI_WORKFLOW"
    gh run view "$ci_run" --log-failed 2>/dev/null | tail -n 120 | cut -c1-300 || true
    printf '```\n'
  fi
} > "$body_file"
gh pr comment "$PR_NUMBER" --body-file "$body_file"
GH_TOKEN="$AGENT_PAT" gh pr edit "$PR_NUMBER" --add-label "agent:implement"
