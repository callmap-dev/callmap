# Coding standards

Follow these rules when you change this repo. Read them with `.sandcastle/PROJECT.md` and `CONTRIBUTING.md`.

## Commits

- Make one logical change in each commit.
- Use the format of `CONTRIBUTING.md`: `<prefix>: <one sentence in the present tense>`. The prefixes are `cli:`, `core:`, `extractor:`, `docs:`, `ci:`, `test:` and `chore:`.
- Do not add an AI attribution or a co-author trailer.

## Branches

- Start from the base branch. Do not merge the base branch into a feature branch.
- Only the `agent-update-branch` workflow merges the base branch into a PR branch.

## Comments

- Do not write code comments. Name things so that the code explains itself.
- Write a comment only for a non-obvious reason that the code cannot state, such as a workaround or an ordering constraint.

## Words

- Use the words of `GLOSSARY.md` in code, tests, docs and commits.
- If your change contradicts an ADR in `docs/adr/`, say so in the PR. Do not change the settled ADR.

## Tests

- Use red-green-refactor against the test seams that exist.
- Do not make a new seam only to test a function alone.
