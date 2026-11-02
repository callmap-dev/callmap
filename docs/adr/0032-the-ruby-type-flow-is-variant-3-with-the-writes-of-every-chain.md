# The Ruby type flow is variant 3, with the writes of every chain

ADR-0027 decision 7 asks for a measurement of 3 variants of the local type flow, and then a choice of the owner. The owner chose variant 3 on issue #12 on 2026-10-30. The commit `99206f9` then changes the rule of an instance variable. This changes decision 7 of ADR-0027. The measurement is in `docs/research/2026-10-30-ruby-type-flow-on-mastodon/`.

## Decisions

1. **Variant 3 is the only local type flow.** A literal, such as `"x"`, `[]`, `{}`, `:x` or `5`, is a value of its core class. `Foo.new` makes a value of `Foo` when the repo does not define `Foo.new`. A local variable has a known class when each write of it in the def sets the same class. A finder of a model, such as `find`, `find_by` or `create`, makes a value of the model when the repo does not define the finder on the class. The probe switch `CALLMAP_RUBY_TYPE_FLOW` and the variants 1 and 2 go.
2. **An instance variable counts the writes of every chain of the object.** ADR-0027 decision 7 gives a known class to an instance variable that one method of the class alone sets. Now the extractor reads every method that an object of the class of the caller can run. These methods come from the class chain of the class and from the chain of each class that has the class in its chain, such as a subclass or a class that includes the module. The instance variable has a known class when one method alone among them writes it, and each write of that method sets the same class. So a write in a subclass, a superclass or a module counts.
3. **A writer macro in any of these chains makes the variable unknown.** A macro that makes the method `x=` in any of these chains makes the instance variable `@x` unknown. Such macros are `attr_writer`, `attr_accessor`, `has_one`, `belongs_to`, `has_many`, `has_and_belongs_to_many` and a `delegate` of `x=`.
4. **The Ruby rules version is 7.** The checker names the new rule.

## Why

- **Variant 3 ties the most calls.** On `mastodon/mastodon` at `7be1842`, with the default scope and no tests, variant 1 gave 45.0%, variant 2 gave 45.5% and variant 3 gave 46.7%. Variant 3 gave 8,596 resolved calls and 9,821 open ends.
- **A finder is a stub of the library, not a guess.** The list of finders is fixed, and a finder ties only when the superclass chain of the class reaches `ActiveRecord::Base`.
- **One class alone does not prove the class of an instance variable.** `Base#setup` and `Child#setup` can set `@x` from 2 classes. Then `@x.total` in `Base#run` can run on a value of either class. The rule of ADR-0027 read only `Base`, so it tied the call to one class. That tie was a guess, and ADR-0027 ties only the calls that its rules prove.

## Consequences

- With the rule of decision 2, the extractor of the commit `99bba6b` gave 8,597 resolved calls and 9,832 open ends on the same commit of mastodon. The `untyped` open ends rose from 8,919 to 8,930. The rate is 46.6%.
- An instance variable that a subclass, a superclass or a module also writes stays an open end with `untyped`.
- `docs/product.md` gives the rate of variant 3 before and after the commit `99206f9`.
