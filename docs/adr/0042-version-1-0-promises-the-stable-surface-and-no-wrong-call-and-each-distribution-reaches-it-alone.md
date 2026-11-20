# Version 1.0 promises the stable surface and no wrong call, and each distribution reaches it alone

Version 1.0 has one definition for the 3 distributions. Each distribution reaches it on its own date, when it passes its gates. The owner made these decisions in the grilling of 2026-11-20.

## Decisions

1. **One definition, 3 dates.** ADR-0040 gives each distribution its own version. So `callmap-ts`, `callmap-go` and `callmap-rb` each tag their own 1.0. No release covers the 3 together.
2. **The user of 1.0 is a stranger.** A stranger installs a distribution, runs it on a repo that the owner never saw, and gets a correct page with no help from the owner.
3. **1.0 promises the stable surface.** A release from 1.0 does not break the command contract, the review input or the graph document without a new major version. The glossary entry **Stable surface** names the 3.
4. **The stable surface holds part of the command contract.** It holds the flags, their defaults, the exit codes and the line on standard output. The texts on standard error, the base cache and the look of the reader page can change in any release.
5. **A new format version is a minor release.** Each reader page carries the page code that reads its own review input. The JSON Schemas of each format version stay in the repo.
6. **A higher runtime floor is a minor release.** The floors of 1.0 are Node 22.18, Go 1.26 and Ruby 3.1.
7. **1.0 promises no wrong call, and no floor for the resolution rate.** The page shows the rate of the branch. A distribution with a low rate can reach 1.0.
8. **1.0 adds no feature from the cut list of the product record.** It is the MVP, with the sample reader page of issue 3.
9. **1.0 supports Linux and macOS.** The CI runs on both. The docs name Windows as not tested.
10. **1.0 states its run times and promises none.** The docs give the measured time of a first review and of a cached review on the audit repo of each language.

## The gates of each distribution

A distribution tags 1.0 when it passes each gate:

1. **The audit.** 200 random call sites from the source text of the audit repo, at one pinned commit, each checked by hand. Each one must be the right call, a one-of group, a library call or an open end. The audit passes with 0 wrong. The audit repos are `apache/echarts` for TypeScript, `go-gitea/gitea` for Go and `mastodon/mastodon` for Ruby.
2. **The 5 repos.** A run on 5 open-source repos of its language, with no crash and each note true. `docs/research/` lists the repos.
3. **The use record.** 20 real reviews by the owner with a released version of the distribution. Each wrong call and each crash has an issue, and each issue is closed. The record holds the date, the distribution, its version, the count of the changed functions and the result. It holds no repo name and no branch name.
4. **The CI.** A job on Linux and a job on macOS, and a job on the runtime floor.
5. **The run times.** The docs state them, as decision 10 says.

## Why

- **A 0.x release already serves the owner.** The change of the user from the owner to a stranger is the one change that a 1.0 can mark.
- **A script and a distribution depend on the stable surface.** Only a person reads the page, so a new layout breaks no user.
- **A frozen message blocks each fix of an unclear sentence.** A script reads the exit code and the page path.
- **The rate is a measurement, and the promise is the proof.** ADR-0027 refuses a guess for Ruby. A floor for the rate would hold `callmap-rb` at 0.x for a fact that the page states openly.
- **A missed call site breaks the promise as a wrong call does.** A sample of the calls of a graph document cannot find it. So the audit takes its sample from the source text.
- **Understanding tools die as nice-to-haves.** The use record shows that the distribution lives inside the daily review before its contract freezes.

## Considered options

- **One 1.0 for the 3 distributions on one day.** The slowest distribution then sets the date of the 3, and ADR-0040 has no tag for it.
- **A floor for the resolution rate.** No number divides a page that helps from a page that does not, and the Ruby rules cannot reach the rates of a type checker.
- **The error messages in the stable surface.** The conformance suite already checks them, but no user needs their exact words.
- **Windows as a supported platform.** One maintainer would keep a third CI platform green for a platform that the owner does not use.
- **A promise for the run time.** It needs a benchmark job in the CI.

## Consequences

- **`callmap-rb` needs its first release before its use record can start.** No `callmap-rb/v*` tag exists on 2026-11-20.
- **`callmap-rb` can reach 1.0 much later than the other 2.** The owner reviews less Ruby, so its 20 reviews take longer.
- **The README can show a public rate for TypeScript.** The audit on `apache/echarts` gives a rate that replaces the rate of the private app.
- **The employer repos stay out of the use record.** The record names no repo, as the product record requires.
