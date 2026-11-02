# The Ruby fixture repo

A repo of 2 Rails apps, a gem and a folder of rule cases that the extractor reads, not code this
repo ships. Every file is here to make one rule of the extraction observable, so a reader can tell
from the tree what the tests assert.

| File                                               | What it holds for the extraction                                                                                                                     |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shop/config/application.rb`                       | The file that makes `shop/` a Rails app                                                                                                              |
| `billing/config/application.rb`                    | The same for `billing/`, a second app with a loader of its own                                                                                       |
| `shop/app/models/order.rb`                         | `def self.x`, `class << self`, calls on `self` and with no receiver, a call in a block, and `Order.from_payload`, which the billing app also defines |
| `shop/app/models/line_item.rb`                     | A class with no `def`, whose library methods a call on its constant reaches                                                                          |
| `shop/app/models/application_record.rb`            | A superclass from a gem, which no file of the app defines                                                                                            |
| `shop/app/models/report.rb`                        | A call on a constant that ties to a singleton method of `Order`, and `render`, a name a controller reaches only through Rails                        |
| `shop/app/models/admin/report.rb`                  | `Admin::Report`, the name a nested reference to `Report` finds first                                                                                 |
| `shop/app/models/concerns/discountable.rb`         | A concern, whose `discount` a call in `Order` reaches only through the class chain, and `has_many :coupons`                                          |
| `shop/app/controllers/admin/base_controller.rb`    | A nested superclass that resolves to the top-level `ApplicationController`                                                                           |
| `shop/app/controllers/application_controller.rb`   | `ApplicationController#authorize`, which a call reaches through 2 superclasses                                                                       |
| `shop/app/controllers/admin/orders_controller.rb`  | Names resolved through the nesting, `render` through `ActionController::Base`, and `Invoice`, which only the billing app defines                     |
| `shop/app/controllers/admin/refunds_controller.rb` | A compact class name, which does not search `Admin` for `Report`                                                                                     |
| `shop/app/jobs/application_job.rb`                 | `ApplicationJob#perform`, which `super` reaches                                                                                                      |
| `shop/app/jobs/receipt_job.rb`                     | `Shipping::Label.new`, which ties to `initialize`, a call on its result, and `super`                                                                 |
| `shop/app/jobs/refund_job.rb`                      | `super`, which a module of a gem reaches before `ApplicationJob#perform`                                                                             |
| `shop/app/services/shipping/label.rb`              | `Shipping::Label#initialize`, a method of a nested class                                                                                             |
| `shop/app/services/shipping/invoice.rb` | `Shipping::Invoice`, so `Invoice` in `Admin` is a missing constant of the shop and not a library constant |
| `shop/lib/reconcile.rb`                            | Code inside an app but outside its autoload roots                                                                                                    |
| `shop/config/initializers/slug.rb`                 | `String#slugify`, a method that the app adds to a class of Ruby                                                                                      |
| `shop/lib/core_ext/string.rb`                      | A second body of `String`, whose method `slugify` calls                                                                                              |
| `billing/app/controllers/invoices_controller.rb`   | `Order`, which resolves to the billing app's own `Order` and not to the shop's                                                                       |
| `billing/app/models/order.rb`                      | A name both apps define                                                                                                                              |
| `billing/app/models/invoice.rb`                    | `Invoice`, which only the billing app defines, and `coupons`, a name that `has_many` makes in the shop                                               |
| `gems/pricing/pricing.gemspec`                     | The file that makes `gems/pricing/` a load unit of its own                                                                                           |
| `gems/pricing/lib/pricing.rb`                      | A constant of the gem, and `Order`, which the gem does not define                                                                                    |
| `gems/pricing/lib/pricing/tax.rb`                  | `Pricing::Tax.rate`, which the gem ties through its own index                                                                                        |
| `gems/pricing/lib/pricing/archive/order.rb` | `Pricing::Archive::Order`, so `Order` in `Pricing` is a missing constant of the gem and not a library constant |
| `tools/release.rb`                                 | Code outside every app, a call outside any `def`, which draws nothing, and `Archive::Order`, so `Order` is a missing constant |

Each folder in `rules/` holds a `.gemspec`, so it is a load unit of its own. Its constants do not
mix with the constants of the other folders.

| Folder                             | What it holds for the extraction                                                                                                 |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `rules/super-in-module/`           | `super` in a prepended module and in an included module, each with 1 includer                                                    |
| `rules/super-several-includers/`   | `super` in a module that 2 classes include, in a module with no includer, and in a module whose includer reaches a library class |
| `rules/singleton-prepend/`         | A module that `class << self` prepends, with `super` in it, and a call on `self` on each side of the class                       |
| `rules/prepend-extend/`            | A call on `self` that finds a prepended module before the class, and a singleton call that finds an extended module              |
| `rules/several-modules/`           | One `include` and one `prepend` with 2 modules each                                                                              |
| `rules/extend-self/`               | A module that extends `self`, and a call on the module                                                                           |
| `rules/class-methods/`             | A concern with a `class_methods` block, and a singleton call in a class that includes it                                         |
| `rules/untyped/`                   | A call on a parameter, whose name a `def` of the repo has                                                                        |
| `rules/self-other/`                | A call on `self` that finds no `def` in the class chain                                                                          |
| `rules/macros/`                    | Methods that `attr_reader` and `delegate` make, whose names a `def` of the repo has                                              |
| `rules/def-in-scope/`              | `spec/support/order_stub.rb`, a body out of the scope that defines the method of a body in the scope                             |
| `rules/singleton-owner/`           | `def Other.x` in the body of another class, at the top of a file, and in a nesting that resolves `Other`                         |
| `rules/module-function/`           | `module_function` with a name, with a `def` and with no argument                                                                 |
| `rules/define-method/`             | `define_method` with a literal name, in the class and in `class << self`, and with a computed name                               |
| `rules/made-classes/`              | A `def` in the block of `Struct.new`, `Data.define` and `Class.new(Base)`                                                        |
| `rules/constant-aliases/`          | Constants that a body and the top level set to a constant path of the repo, of a library, of another alias, and in a cycle through a path of the repo |
| `rules/send/`                      | `send`, `public_send` and `try` with a literal name and with a computed name                                                     |
| `rules/send-missing/`              | `send` with a literal name and with a computed name on a constant that does not resolve, and `Books::Ledger`, which no nesting of the call finds |
| `rules/library-constants/` | Constants of a library, a library alias, a typo in a top name and in a later segment, and a name that only another nesting has |
| `rules/function-value/`            | `yield`, `block.call`, `callable.()` and `method(:x).call`                                                                       |
| `rules/send-splat/`                | `send` with a splat, and a mixin and a macro with a splat                                                                        |
| `rules/method-missing/`            | A class that defines `method_missing`, and a call on `self` that finds no `def`                                                  |
| `rules/concern-one-of/`            | A call on `self` in a concern with no `def` of its name, which 2 classes include                                                 |
| `rules/library-include-one-of/`    | A call on `self` in a module that includes a library module, with 2 includers and with none                                      |
| `rules/abstract/`                  | An abstract method, which 2 subclasses override and 1 does not                                                                   |
| `rules/concrete-override/`         | A concrete method, which a subclass overrides                                                                                    |
| `rules/no-implementation/`         | A concern and an abstract method whose only members the tests leave out of the scope                                             |
| `rules/reopened-core/`             | A call on `self` in a reopened `String`, whose name only another class of the repo defines                                       |
| `rules/literals/`                  | Calls on literals, whose core classes the repo reopens                                                                           |
| `rules/library-literals/`          | Calls on literals, whose core classes the repo does not reopen                                                                   |
| `rules/new/`                       | `Foo.new` with arguments and a block, a class with its own `new`, and a missing constant                                         |
| `rules/singleton-new/`             | `new` with no receiver and on `self` in a singleton method, in a subclass, and in a class with its own `new`                     |
| `rules/local-variables/`           | Local variables that each write sets from `Foo.new`, a literal or 2 classes, and a block parameter that hides a variable         |
| `rules/instance-variables/`        | Instance variables that 1 method alone writes, that 2 methods write, and that `attr_accessor` makes                              |
| `rules/shared-instance-variables/` | Instance variables that a subclass, a superclass, a module or an `attr_writer` of a module also writes                           |
| `rules/finders/`                   | Finders of a model, of a class that defines its own finder, and of a class that is not a model                                   |
| `rules/unparsed/`                  | A file that Ripper cannot parse, beside a file that it can parse                                                                 |

Nothing here is linted or type-checked, because it is held exactly as an extractor must find it.
