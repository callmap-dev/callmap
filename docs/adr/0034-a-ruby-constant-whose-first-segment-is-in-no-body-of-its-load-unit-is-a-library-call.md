# A Ruby constant whose first segment is in no body of its load unit is a library call

The owner added this rule to the Ruby spec on 2026-11-02. This changes decision 4 of ADR-0027, which gives `missing-module` to each constant that does not resolve. It also changes decision 6 of ADR-0027, which makes a constant that does not resolve outside any Rails app an open end.

## Decisions

1. **A library constant.** A constant that does not resolve in its load unit gives a library call when the first segment of its path, as the code writes it, has 3 properties. No `class` or `module` body of the load unit has a segment of that name. Zeitwerk naming gives no constant with a segment of that name in the load unit. And the first segment does not resolve in the load unit to a constant of the repo, directly or through an alias. So `Time.current`, `Rails.logger` and `::Faraday::Error.build` are library calls when no body of the unit has a segment named `Time`, `Rails` or `Faraday`.
2. **A missing constant of the repo.** Any other constant that does not resolve still gives an open end with `missing-module`. So `Payments::Gatewy.charge` is an open end when the unit has `module Payments`. `Bar.x` in `module Orders` is an open end when a body of the unit is `Other::Bar` and `Bar` does not resolve from that nesting. `Gate::Missin.charge` is an open end when `Gate = Payments::Gateway` and the unit has `class Payments::Gateway`.
3. **An alias stands for its target.** When a constant on the path is an alias whose target does not resolve, the rule reads the target in place of the alias. So `RequestError = ::Faraday::Error` makes `RequestError.build` a library call. This is also true when Zeitwerk names `RequestError` after the file of the alias. A cycle of aliases reads the target of the last alias that the cycle reaches.
4. **`send` with a computed name.** On a constant that this rule makes a library constant, `send` with a computed name is a library call too, and not an open end with `missing-module`.
5. **No list and no dependency file.** The rule needs no list of the constants of a library. It reads no `Gemfile.lock` and no other dependency file.
6. **The Ruby rules version is 9.** The commit that raised the version to 8 came before this rule and before the rule of a constant alias and of `new` in a singleton method. So version 9 names the rules of this record, and version 8 names 3 different rule sets.

## Why

- **Library constants hid the real "code not found" open ends.** A call such as `Rails.logger` was an open end only because a `def` of the repo had the name `logger`. On a large Rails app, most `missing-module` open ends were constants of the standard library, a gem or Rails. A reader could not find the few constants that the repo misses among them. On `mastodon/mastodon`, the `missing-module` open ends fall from 373 to 54, and the rate rises from 46.7% to 47.6%.
- **The body names are in the repo.** A first segment that no body of the unit has cannot be a constant that the unit misses by a typo in a later segment. A first segment that a body has, such as `Payments`, names code of the repo.
- **No dependency file.** Story 33 of the Ruby spec keeps the Ruby base cache entry when `Gemfile.lock` changes, because the Ruby rules load no gem. Decision 12 of ADR-0030 says that the Ruby rules read only the source of the repo. A rule that reads `Gemfile.lock` would break both.

## Consequences

- **A typo in a new first segment hides.** `Paymnets::Gateway.charge`, where no body of the unit has a segment named `Paymnets`, is a library call. The page does not show it, and the rate does not count it.
- A constant of a gem whose first segment is also a segment of a body of the unit, such as `Rails` in a body `Admin::Rails`, still gives `missing-module`.
- A reopened core class, such as `class String`, makes `String` a segment of the unit. So a constant such as `String::Foo` that does not resolve gives `missing-module`.
