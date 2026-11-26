# The gates of version 1.0

This package holds the tools of the repo for the gates of ADR-0042. No distribution ships them, and they are not part of the stable surface.

## The audit command

The audit command reads one reader page and writes an audit sheet. Run it from the root of a clone:

```sh
npm run audit -- review.html --seed 7 --repo apache/echarts --distribution callmap-ts --version 0.1.0 --out audit-sheet.md
```

- `--seed <seed>` sets the seeded generator, a whole number from 0 to 4294967295. The same page and the same seed give a byte-identical audit sheet.
- `--count <count>` sets the count of the sampled lines. The default is 200.
- `--repo <repo>`, `--distribution <distribution>` and `--version <version>` name the repo, the distribution and its version in the head of the sheet. The commit and the checker come from the page.
- `--out <file>` names the audit sheet to write.

The command reads the review input from the data block of the page, so it refuses a format version that it does not know. It takes the branch sources from the packed sources. A line is a candidate when it holds an opening parenthesis and is not a comment line. In a Ruby file, a line with an identifier and no parenthesis is a candidate too, because a Ruby call needs no parenthesis. The command sorts the candidates by file and line and picks the count of them with Mulberry32, a seeded generator of the package. It writes the picked lines in the order of file and line.

A section of a line where the graph document holds nothing says so. Decide if the call on that line is a library call or a missed call site.

## The count of the verdicts

Write `right` or `wrong` after `Verdict:` in each section of the audit sheet. Then count the verdicts:

```sh
npm run audit -- --verdicts audit-sheet.md
```

The command prints one line with the count of `right`, of `wrong` and of empty verdicts, for example `198 right, 1 wrong, 1 empty`. It exits with code 0 only when each verdict is `right`. It exits with code 1 when a verdict is `wrong` or empty. A verdict with another word, a section with no verdict line or with text after its verdict line, and a sheet with another count of sections than its head names make the command fail with a message that names the problem.

## The field run command

The field run command runs the review command of one distribution on a list of repos and writes a field record. Run it from the root of a clone, with the review command at the end, as the conformance suite takes it:

```sh
npm run field-run -- --list repos.json --distribution callmap-ts --version 0.1.0 --out field-record.md callmap-ts
```

- `--list <list file>` names a JSON file that holds an array of repos. Each entry holds `url`, the URL of the repo, `branchCommit`, the commit of the branch side, and `baseCommit`, the commit of the base.
- `--distribution <distribution>` and `--version <version>` name the distribution and its version in the head of the record.
- `--out <file>` names the field record to write.

For each repo, the command clones the repo into a temporary folder and checks out the branch commit. It runs the review command with `--base`, `--out`, `--no-open` and `--no-cache`, and takes the time as the time of a first review. Then it runs the review command 2 times with the cache on, and takes the time of the second run as the time of a cached review. It removes the clone after the runs. A repo that fails does not stop the run.

The command prints `ok` or `FAIL` and the URL of each repo. The field record is a Markdown file. Its head names the distribution, its version, the checker, the system and the processor. Each repo gets one section with the commits and the exit code. The section of a repo that passed also holds the 2 run times, the resolution rate from the page and each note of the first review. The section of a repo that failed holds the message of the failed run. Check by hand that each note is true. The command exits with code 1 when a repo failed, and with code 0 otherwise.
