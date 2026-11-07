# The page computes the review and lays out every view

The reader page computes the review from the review input, and it lays out every view with ELK in a Web Worker. A distribution only reads git, runs its extractor, keeps the base cache and writes the review input into the page. The owner made this decision in a grilling on 2026-11-07, as part of ADR-0036.

This supersedes ADR-0016. The command no longer lays out the Diff view and the top level of the Whole project view, and the page data holds no `placements`. ELK keeps `elk.layered.thoroughness` at 3.

## Why

- **A Go or Ruby distribution has no Node.** ELK is JavaScript, and the review core is TypeScript. In the page, both run in the browser of the reader, whatever language the distribution is in.
- **The review core keeps one copy.** A port of `packages/review/src` to Go and to Ruby gives 3 copies of the rules for the hops, the entry points and the rates. The copies can drift apart.

## Considered options

- **Port the review core to each language.** It was rejected because of the 3 copies.
- **Embed a JavaScript engine in each distribution to run ELK.** It was rejected because each distribution then carries a JavaScript engine to run one library.

## Consequences

- **The page is busy longer on a large review.** ADR-0016 measured a private app with 301 functions: about 1.3 s of ELK for the Whole project tab and about 1 s for the Diff view. These costs move back to the page. The Web Worker keeps the page from a freeze, but spec 24 asks for less than 1 s for each view, and a large review does not meet it.
- **The command is faster.** It no longer lays out 2 views, which cost about 1 s on the same app.
- **The same review input and the same page version give a byte-identical page file.** The layout input to ELK keeps its fixed order, so the same review input gives the same drawing.
- **The page size can grow,** because the page holds the graph documents of the base and the branch in place of the computed review. Step 1 of the migration measures it.
