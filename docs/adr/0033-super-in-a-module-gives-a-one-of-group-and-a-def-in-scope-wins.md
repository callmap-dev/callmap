# `super` in a module gives a one-of group, and a def in scope wins

The owner added 2 decisions to the Ruby spec on 2026-11-02, after the second review of the branch. This changes decisions 3 and 7 of ADR-0030.

## Decisions

1. **`super` in a module with several includers.** `super` in a method of a module that several classes include or prepend gives a one-of group. The group holds the `def` that the chain of each includer finds next after the module. With no includer, or with no next `def` in the repo for any includer, decision 8 of ADR-0030 applies. Then the call is an open end with `no-implementation` when the repo has a `def` of the name. It is a library call when a chain reaches a library class first, or when the repo has no `def` of the name.
2. **A def in scope wins.** When 2 bodies of one class define the same method, a `def` in a file in the scope wins over a `def` in a file out of the scope. Between 2 `def`s that are both in the scope or both out of it, the `def` of the last file in path order wins.

## Why

- **Each includer has its own chain.** A class that includes the module puts the module in its own chain, so `super` can find a different `def` in each class. For one object, only one of them runs. A call on `self` in a module has the same shape, and decision 8 of ADR-0030 gives it a one-of group too.
- **A file out of the scope is often a test stub.** A file such as `spec/support/order_stub.rb` can reopen `Order` with `def total`. It comes after `app/models/order.rb` in path order. Without this rule, the stub replaces the method of the app, and a call to `total` in the app becomes a library call.

## Consequences

- `super` in a module with 1 includer gives a one-of group with 1 call.
- A `def` out of the scope still decides a call when no `def` in the scope has the name. Then the call is a library call, as for any callee out of the scope.
