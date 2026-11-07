# The conformance suite

The conformance suite proves that a distribution gives the right review input. ADR-0036 and ADR-0038 record it.

## The fixture repos

Each fixture repo has its own folder: `fixture-repos/<language>/<case>/`. The folder holds 3 things:

- `base/` holds the files of the base commit.
- `branch/` holds the files of the branch commit.
- `expected-review-input.json` holds the review input that the review command must give.

The suite makes a git repo from each folder. It commits `base/` on the branch `main`, and then `branch/` on the branch `feature`.

## Run the suite

Give the review command of the distribution after the flags. The suite adds `review <repo> --no-open --no-cache --out <file>` to it. For example, this runs the suite against the current `callmap` command:

```sh
npm run conformance -- node packages/cli/src/cli.ts
```

A distribution of one language names its language. For example:

```sh
npm run conformance -- --language go callmap-go
```

- `--language <language>` runs only the fixture repos in `fixture-repos/<language>/`.
- `--fixtures <folder>` reads the fixture repos from another folder.
- `--update` writes each expected file again.

## The compare

The suite reads the data block of the page and unpacks the sources. It puts the sources in the field `sources` in place of `packedSources`. Then it masks 3 values, because they change from one machine to the next:

- The base commit and the head commit become `<commit>`.
- The repo root of the editor choice becomes `<repo root>`.
- The checker version of each graph document becomes `<checker version>`.

The suite compares the result with the expected file as JSON values. The key order is not part of the contract. If the values differ, the suite prints a line diff of the 2 values with sorted keys.

## Update an expected file

Update an expected file only when the review input changes on purpose.

1. Change the files in `base/` or `branch/`, or change the review command.
2. Run the suite with `--update` and with the language of the fixture repo. For example: `npm run conformance -- --update --language go node packages/cli/src/cli.ts`.
3. Read the diff of the expected file in git. Make sure that each change is the change that you want.
4. Commit the expected file in the same commit as the change.

The suite writes each expected file with its keys in sorted order. Do not edit an expected file by hand.
