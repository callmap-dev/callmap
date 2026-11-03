# Coding standards

These rules tell you how to write a change to Callmap. A reviewer, human or agent, checks a pull request against them. `npm run lint` already checks the format, the types and the ESLint rules, so this file does not repeat them. `CONTRIBUTING.md` gives the checks, the branch names and the commit format.

## Words

- Use the words of `GLOSSARY.md` in code, tests, CSS classes, docs and commits.
- Do not use a word that `GLOSSARY.md` lists under _Avoid_. For example, a call is not an "edge", and a function is not a "node".
- If a change needs a new term, add it to `GLOSSARY.md` in the same pull request.
- If a change renames a term, rename it everywhere: code, tests, docs and the glossary. A settled ADR keeps its old words.

## Decisions

- Read the ADRs in `docs/adr/` for the part that you change. The code must not contradict a settled ADR.
- A new decision gets a new ADR. These are decisions: a new dependency, a new kind of test, a new file format, and a change to a rule that an ADR records.
- Do not rewrite a settled ADR. The new ADR says which ADR it changes, in part or in full.
- Language knowledge lives in the extractors. The core packages and the reader page do not know the language of a graph document. ADR-0009 and ADR-0012 record this.

## Code

- Write functions as `const` arrow functions, and data as `interface` and `type` with `readonly` fields. Use a class only where an API needs one.
- Give each helper, constant and type one home. If 2 files need the same helper, export it from one file. Do not copy it.
- Keep the parse of an id format next to the function that builds the id. Do not split an id string in the code that uses it.
- Give a name that says what the value holds. A name like `still`, `sized` or `laidOut` for a value that is not a layout fails this rule.
- Give a module one reason to change. If a file holds pan, zoom, drag and the wheel, split it.
- Do not pass a call through an object only to reach another object. A caller must not chain `a.b.c()` through a middle man.

## Errors

- Do not fall back in silence. If an input is malformed, fail, or report the problem to the user. A broken `tsconfig.json` must not quietly drop the path aliases.
- If a name, a type or a comment states an invariant, the code enforces it.

## Comments

- Do not write code comments. Name things so the code explains itself.
- Write a comment only for a reason that the code cannot state, such as a workaround, a spec quirk or an ordering constraint.
- Never restate what the next line does. No section banners, no TODOs and no commented-out code.

## Tests

- Put the tests of a package in `packages/<package>/test/*.test.ts`. Put the tests that cross packages in `test/`.
- Test a package through its public `src/index.ts`. Build the test data with small builders in the test file.
- Use red-green-refactor against the test seams that exist. Do not make a new seam only to test a function alone.
- Give each acceptance criterion of the issue a test that fails without the change.
- If a change touches the reader page, run `npm run test:browser`. If it changes the look, also run `npm run screenshots`.

## Scope

- Build what the issue asks for, and nothing more.
- If the change does more than the issue names, list each extra change in the pull request, with the reason.
- A pull request meets every acceptance criterion of its issue, or it says which criterion it does not meet.

## Writing

- Write docs, ADRs, commit messages and pull request text in Simplified Technical English. Use short sentences, the active voice and one word for one meaning.
- Do not use an em dash or an en dash in a sentence. Do not use a slash for "or" or "and".
- Do not add an AI attribution or a co-author trailer.
