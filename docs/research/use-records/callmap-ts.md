# The use record of `callmap-ts`

This file is the use record of `callmap-ts` for the use record gate of ADR-0042. The gate needs 20 real reviews by the owner with a released version of `callmap-ts`.

Each line of the table records one review:

- **Date:** the day of the review, as `YYYY-MM-DD`.
- **Version:** the released version of `callmap-ts` that ran the review.
- **Changed functions:** the count of the changed functions on the reader page.
- **Result:** `ok` when the review found no wrong call and no crash, `wrong call` when it found a wrong call, or `crash` when the review command crashed.
- **Issue:** a link to the issue of the wrong call or of the crash. It is empty when the result is `ok`. The gate passes only when each issue is closed.

A line holds no repo name and no branch name, as the product record requires. So no employer repo shows in this file.

| Date | Version | Changed functions | Result | Issue |
| ---- | ------- | ----------------- | ------ | ----- |
