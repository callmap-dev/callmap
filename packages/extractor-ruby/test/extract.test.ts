import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readGraphDocument } from '@callmap/graph-document';
import type { GraphDocument } from '@callmap/graph-document';
import { reviewOf } from '@callmap/review';
import { extractRuby } from '../src/index.ts';
import { tempDir } from '../../../test/temp-dir.ts';

const FIXTURE = fileURLToPath(new URL('../fixture', import.meta.url));

const ORDER = 'shop/app/models/order.rb';
const REPORT = 'shop/app/models/report.rb';
const LABEL = 'shop/app/services/shipping/label.rb';
const RECEIPT_JOB = 'shop/app/jobs/receipt_job.rb';
const RELEASE = 'tools/release.rb';
const DISCOUNTABLE = 'shop/app/models/concerns/discountable.rb';
const ORDERS_CONTROLLER = 'shop/app/controllers/admin/orders_controller.rb';
const BILLING_ORDER = 'billing/app/models/order.rb';
const INVOICES_CONTROLLER = 'billing/app/controllers/invoices_controller.rb';
const PRICING = 'gems/pricing/lib/pricing.rb';

const runs = new Map<string, GraphDocument>();

const extract = (...scope: readonly string[]): GraphDocument => {
  const key = JSON.stringify(scope);
  const known = runs.get(key);
  if (known !== undefined) return known;
  const document = extractRuby({ repo: FIXTURE, scope });
  runs.set(key, document);
  return document;
};

const ruleCase = (name: string, ...scope: readonly string[]): GraphDocument => {
  const folder = `rules/${name}/`;
  const document = extract(...scope);
  return {
    ...document,
    files: document.files.filter((file) => file.startsWith(folder)),
    functions: document.functions.filter(({ file }) => file.startsWith(folder)),
    calls: document.calls.filter(({ caller }) => caller.startsWith(folder)),
    openEnds: document.openEnds.filter(({ caller }) => caller.startsWith(folder)),
  };
};

const repoOf = (files: Readonly<Record<string, string>>): string => {
  const repo = tempDir('callmap-ruby-');
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(repo, path)), { recursive: true });
    writeFileSync(join(repo, path), text);
  }
  return repo;
};

const namesIn = (document: GraphDocument, file: string): readonly string[] =>
  document.functions.filter((graphFunction) => graphFunction.file === file).map(({ name }) => name);

const callsOf = (document: GraphDocument): readonly string[] =>
  document.calls.map(({ caller, callee, line }) => `${caller} ${callee} ${line}`);

const openEndsOf = (document: GraphDocument): readonly string[] =>
  document.openEnds.map(
    ({ caller, line, expression, reason }) => `${caller} ${line} ${expression} ${reason}`,
  );

describe('extractRuby', () => {
  it('emits a graph document that the core accepts, in the Ruby language', () => {
    const document = readGraphDocument(extract());
    expect(document.language).toBe('ruby');
  });

  it('names an instance method with # and a singleton method with a dot', () => {
    expect(namesIn(extract(), ORDER)).toEqual([
      'Order.find_open',
      'Order.recent',
      'Order#total',
      'Order#subtotal',
      'Order#discount_of',
      'Order#count',
      'Order.from_payload',
    ]);
  });

  it('names a method of a nested class with its full name', () => {
    expect(namesIn(extract(), LABEL)).toEqual([
      'Shipping::Label#initialize',
      'Shipping::Label#print',
    ]);
  });

  it('names def Other.x by the class that its receiver resolves to in the lexical nesting', () => {
    const document = ruleCase('singleton-owner');
    expect(namesIn(document, 'rules/singleton-owner/lib/holder.rb')).toEqual([
      'Other.made_here',
      'Holder.top_level_singleton',
    ]);
    expect(namesIn(document, 'rules/singleton-owner/lib/shop.rb')).toEqual(['Shop::Order.build']);
    expect(callsOf(document)).toEqual([
      'rules/singleton-owner/lib/other.rb#Other.run rules/singleton-owner/lib/holder.rb#Other.made_here 3',
    ]);
  });

  it('gives each function the file and the name as its id, and its first and last line', () => {
    expect(extract().functions.find(({ name }) => name === 'Order.recent')).toMatchObject({
      id: `${ORDER}#Order.recent`,
      file: ORDER,
      firstLine: 11,
      lastLine: 13,
    });
  });

  it('adds the ~n suffix in source order to a repeated name of one file', () => {
    const repo = repoOf({
      'lib/cart.rb': 'class Cart\n  def add; end\nend\n\nclass Cart\n  def add; end\nend\n',
    });
    expect(extractRuby({ repo }).functions.map(({ id }) => id)).toEqual([
      'lib/cart.rb#Cart#add',
      'lib/cart.rb#Cart#add~2',
    ]);
  });

  it('names a method at the top level of a file by its name alone', () => {
    const repo = repoOf({ 'bin/setup.rb': 'def run\n  prepare\nend\n\ndef prepare; end\n' });
    const document = extractRuby({ repo });
    expect(document.functions.map(({ name }) => name)).toEqual(['run', 'prepare']);
    expect(callsOf(document)).toEqual(['bin/setup.rb#run bin/setup.rb#prepare 2']);
  });

  it('changes the source hash of a method when its text changes, and of no other method', () => {
    const before = repoOf({
      'lib/cart.rb': 'class Cart\n  def add\n    1\n  end\n\n  def drop; end\nend\n',
    });
    const after = repoOf({
      'lib/cart.rb': 'class Cart\n  def add\n    2\n  end\n\n  def drop; end\nend\n',
    });
    const hashes = (repo: string) =>
      extractRuby({ repo }).functions.map(({ sourceHash }) => sourceHash);
    const [addBefore, dropBefore] = hashes(before);
    const [addAfter, dropAfter] = hashes(after);
    expect(addAfter).not.toBe(addBefore);
    expect(dropAfter).toBe(dropBefore);
  });
});

describe('the calls of extractRuby', () => {
  it('ties a call with no receiver and a call on self to a def of the same class', () => {
    expect(callsOf(extract())).toEqual(
      expect.arrayContaining([
        `${ORDER}#Order#total ${ORDER}#Order#subtotal 18`,
        `${ORDER}#Order#total ${ORDER}#Order#discount_of 18`,
        `${ORDER}#Order.recent ${ORDER}#Order.find_open 12`,
      ]),
    );
  });

  it('gives a call in a block to the def around it', () => {
    expect(callsOf(extract())).toContain(`${ORDER}#Order#total ${ORDER}#Order#count 17`);
  });

  it('ties a call on self to a method that a concern of the class defines', () => {
    expect(callsOf(extract())).toContain(
      `${ORDER}#Order#discount_of ${DISCOUNTABLE}#Discountable#discount 26`,
    );
  });

  it('ties a call on self to a method of a second body of a reopened library class', () => {
    expect(callsOf(extract())).toContain(
      'shop/config/initializers/slug.rb#String#slugify shop/lib/core_ext/string.rb#String#squish_dashes 3',
    );
  });

  it('gives a library call for a call on self in a reopened core class that the repo does not define, even when a def of the repo has its name', () => {
    const document = ruleCase('reopened-core');
    expect(callsOf(document)).toEqual([]);
    expect(openEndsOf(document)).toEqual([]);
  });

  it('ties a call on self through the superclasses of the class', () => {
    expect(callsOf(extract())).toContain(
      `${ORDERS_CONTROLLER}#Admin::OrdersController#index shop/app/controllers/application_controller.rb#ApplicationController#authorize 4`,
    );
  });

  it('gives a library call for a call on self that reaches ActionController::Base first', () => {
    const document = extract();
    const lines = [...document.calls, ...document.openEnds]
      .filter(({ caller }) => caller === `${ORDERS_CONTROLLER}#Admin::OrdersController#show`)
      .map(({ line }) => line);
    expect(lines).toEqual([10]);
  });

  it('ties super to the method of the same name in the next ancestor of the repo', () => {
    expect(callsOf(extract())).toContain(
      `${RECEIPT_JOB}#ReceiptJob#perform shop/app/jobs/application_job.rb#ApplicationJob#perform 5`,
    );
  });

  it('gives a library call for super when a framework module comes before the method of the repo', () => {
    const document = extract();
    expect(
      [...document.calls, ...document.openEnds].filter(({ caller }) =>
        caller.startsWith('shop/app/jobs/refund_job.rb'),
      ),
    ).toEqual([]);
  });

  it('ties super in a prepended or included module to the method of the same name in the class chain after the module', () => {
    expect(callsOf(ruleCase('super-in-module'))).toEqual([
      'rules/super-in-module/lib/loud.rb#Loud#greet rules/super-in-module/lib/person.rb#Person#greet 3',
      'rules/super-in-module/lib/polite.rb#Polite#greet rules/super-in-module/lib/base.rb#Base#greet 3',
    ]);
  });

  it('gives a one-of group over the next def of each includer for super in a module that several classes include', () => {
    const group = 'rules/super-several-includers/lib/polite.rb:3:5';
    const document = ruleCase('super-several-includers');
    expect(oneOfCallsOf(document)).toEqual([
      `rules/super-several-includers/lib/polite.rb#Polite#greet rules/super-several-includers/lib/a.rb#A#greet 3 ${group}`,
      `rules/super-several-includers/lib/polite.rb#Polite#greet rules/super-several-includers/lib/b.rb#B#greet 3 ${group}`,
    ]);
    expect(openEndsOf(document)).toEqual([
      'rules/super-several-includers/lib/lonely.rb#Lonely#greet 3 super no-implementation',
    ]);
  });

  it('puts a module that class << self prepends before the singleton methods of the class, and out of its instance chain', () => {
    const document = ruleCase('singleton-prepend');
    expect(callsOf(document)).toEqual([
      'rules/singleton-prepend/lib/person.rb#Person.welcome rules/singleton-prepend/lib/tracer.rb#Tracer#greet 9',
      'rules/singleton-prepend/lib/tracer.rb#Tracer#greet rules/singleton-prepend/lib/person.rb#Person.greet 3',
    ]);
    expect(openEndsOf(document)).toEqual([
      'rules/singleton-prepend/lib/person.rb#Person#run 13 greet other',
    ]);
  });

  it('ties a call on self to a prepended module before the class, and to an extended module on the class', () => {
    expect(callsOf(ruleCase('prepend-extend'))).toEqual([
      'rules/prepend-extend/lib/person.rb#Person#hello rules/prepend-extend/lib/loud.rb#Loud#greet 8',
      'rules/prepend-extend/lib/person.rb#Person.load rules/prepend-extend/lib/finders.rb#Finders#find_all 12',
    ]);
  });

  it('ties a call on self to the first module of one include or prepend with several modules', () => {
    expect(callsOf(ruleCase('several-modules'))).toEqual([
      'rules/several-modules/lib/c.rb#C#run rules/several-modules/lib/a.rb#A#x 5',
      'rules/several-modules/lib/d.rb#D#run rules/several-modules/lib/b.rb#B#x 7',
    ]);
  });

  it('ties a call on a module that extends self to the instance method of the module', () => {
    const document = ruleCase('extend-self');
    expect(callsOf(document)).toEqual([
      'rules/extend-self/lib/runner.rb#Runner#run rules/extend-self/lib/m.rb#M#a 3',
    ]);
    expect(openEndsOf(document)).toEqual([]);
  });

  it('ties a call on the class of a Rails concern to a method of its class_methods block', () => {
    expect(callsOf(ruleCase('class-methods'))).toEqual([
      'rules/class-methods/app/models/post.rb#Post.top rules/class-methods/app/models/concerns/searchable.rb#Searchable::ClassMethods#search 5',
    ]);
  });

  it('ties a call on a constant to a singleton method of that class', () => {
    expect(callsOf(extract())).toContain(`${REPORT}#Report#rows ${ORDER}#Order.recent 3`);
  });

  it('ties Foo.new to Foo#initialize', () => {
    expect(callsOf(extract())).toContain(
      `${RECEIPT_JOB}#ReceiptJob#perform ${LABEL}#Shipping::Label#initialize 4`,
    );
  });

  it('gives an untyped open end for a call that does not tie, when a def of the repo has its name', () => {
    expect(openEndsOf(ruleCase('untyped'))).toEqual([
      'rules/untyped/lib/printer.rb#Printer#run 3 label.print untyped',
    ]);
  });

  it('ties a call on Foo.new with arguments to the instance method of Foo', () => {
    expect(callsOf(extract())).toContain(
      `${RECEIPT_JOB}#ReceiptJob#perform ${LABEL}#Shipping::Label#print 4`,
    );
  });

  it('gives an open end with other for a call on self that finds no def in a class chain of the repo', () => {
    expect(openEndsOf(ruleCase('self-other'))).toEqual([
      'rules/self-other/lib/cart.rb#Cart#add 3 total other',
    ]);
  });

  it('gives a library call for a method that has_many makes, even when a def of the repo has its name', () => {
    const document = extract();
    expect(
      [...document.calls, ...document.openEnds].filter(
        ({ caller }) => caller === `${DISCOUNTABLE}#Discountable#discount`,
      ),
    ).toEqual([]);
  });

  it('gives a library call for a method that attr_reader or delegate makes', () => {
    const document = ruleCase('macros');
    expect([...document.calls, ...document.openEnds]).toEqual([]);
  });

  it('draws nothing for a library call, whose name no def of the repo has', () => {
    const document = extract();
    const lines = [...document.calls, ...document.openEnds]
      .filter(({ caller }) => caller === `${ORDER}#Order#subtotal`)
      .map(({ line }) => line);
    expect(lines).toEqual([]);
  });

  it('draws nothing for a call outside any def', () => {
    const document = extract();
    const fromRelease = [...document.calls, ...document.openEnds].filter(({ caller }) =>
      caller.startsWith(RELEASE),
    );
    expect(fromRelease.map(({ line }) => line)).toEqual([3]);
  });

  it('ties a constant of a gem outside Rails through the index of its load unit', () => {
    expect(callsOf(extract())).toContain(
      `${PRICING}#Pricing.quote gems/pricing/lib/pricing/tax.rb#Pricing::Tax.rate 3`,
    );
  });

  it('keeps the constants of 2 Rails apps and a gem apart', () => {
    const document = extract();
    expect(callsOf(document)).toContain(
      `${INVOICES_CONTROLLER}#InvoicesController#create ${BILLING_ORDER}#Order.from_payload 3`,
    );
    expect(callsOf(document)).not.toContain(
      `${INVOICES_CONTROLLER}#InvoicesController#create ${ORDER}#Order.from_payload 3`,
    );
    expect(openEndsOf(document)).toEqual(
      expect.arrayContaining([
        `${ORDERS_CONTROLLER}#Admin::OrdersController#show 10 Invoice.for missing-module`,
        `${PRICING}#Pricing.recent 7 Order.recent missing-module`,
        `${RELEASE}#Release#run 3 Order.count missing-module`,
      ]),
    );
  });

  it('ties a call to the def in scope when a body out of scope defines the same method', () => {
    const document = ruleCase('def-in-scope', '!**/spec/**');
    expect(callsOf(document)).toEqual([
      'rules/def-in-scope/app/models/order.rb#Order#run rules/def-in-scope/app/models/order.rb#Order#total 5',
    ]);
  });

  it('gives a library call for a callee whose file the scope leaves out', () => {
    const document = extract('shop/app/models/report.rb');
    expect(callsOf(document)).toEqual([`${REPORT}#Report#render ${REPORT}#Report#rows 7`]);
    expect(document.openEnds).toEqual([]);
  });
});

describe('the metaprogramming of extractRuby', () => {
  it('names a method of module_function Mod.x, and ties a call through self in the module to it', () => {
    const document = ruleCase('module-function');
    expect(namesIn(document, 'rules/module-function/lib/units.rb')).toEqual([
      'Units.to_cm',
      'Units.to_in',
      'Units.to_mm',
    ]);
    expect(callsOf(document)).toEqual([
      'rules/module-function/lib/ruler.rb#Ruler#mark rules/module-function/lib/units.rb#Units.to_mm 3',
      'rules/module-function/lib/units.rb#Units.to_mm rules/module-function/lib/units.rb#Units.to_cm 9',
    ]);
  });

  it('names a method of define_method with a literal name at the line of that call', () => {
    const document = ruleCase('define-method');
    expect(
      document.functions.map(({ name, firstLine, lastLine }) => `${name} ${firstLine}-${lastLine}`),
    ).toEqual(['Flags#on 2-4', 'Flags.load 7-9', 'Flags#reset 14-14']);
    expect(callsOf(document)).toEqual([
      'rules/define-method/lib/flags.rb#Flags#on rules/define-method/lib/flags.rb#Flags#reset 3',
    ]);
  });

  it('names a def in the block of a constant from Struct.new, Data.define or Class.new as a method of that constant', () => {
    const document = ruleCase('made-classes');
    expect(namesIn(document, 'rules/made-classes/lib/shapes.rb')).toEqual([
      'Shapes::Point#norm',
      'Shapes::Size#area',
      'Shapes::Square#draw',
    ]);
    expect(callsOf(document)).toEqual([
      'rules/made-classes/lib/shapes.rb#Shapes::Square#draw rules/made-classes/lib/shapes/base.rb#Shapes::Base#outline 14',
      'rules/made-classes/lib/shapes.rb#Shapes::Square#draw rules/made-classes/lib/shapes.rb#Shapes::Point#norm 15',
    ]);
    expect(openEndsOf(document)).toEqual([]);
  });

  it('follows a constant that a body or the top level sets to a constant path, in the nesting of the assignment', () => {
    const copier =
      'rules/constant-aliases/lib/accounts/billing/services/invoice_copier.rb#Accounts::Billing::Services::InvoiceCopier';
    const plan =
      'rules/constant-aliases/lib/accounts/billing/services/invoice_plan.rb#Accounts::Billing::Services::InvoicePlan.build';
    const index =
      'rules/constant-aliases/lib/shared/services/ledger_index.rb#Shared::Services::LedgerIndex.code_for';
    const document = ruleCase('constant-aliases');
    expect(callsOf(document)).toEqual([
      `${copier}#plan ${plan} 10`,
      `${copier}#code ${index} 11`,
      `${copier}#chained ${plan} 12`,
      `rules/constant-aliases/lib/report.rb#Report#code ${index} 5`,
    ]);
    expect(openEndsOf(document)).toEqual([`${copier}#loop 15 Loop.build missing-module`]);
  });

  it('gives a library call for a constant that does not resolve when no body and no Zeitwerk constant of the load unit has its first segment, and the first segment resolves to no repo constant', () => {
    const checkout = 'rules/library-constants/lib/orders/checkout.rb#Orders::Checkout#run';
    const document = ruleCase('library-constants');
    expect(callsOf(document)).toEqual([
      `${checkout} rules/library-constants/lib/payments/gateway.rb#Payments::Gateway.charge 16`,
    ]);
    expect(openEndsOf(document)).toEqual([
      `${checkout} 13 Payments::Gatewy.charge missing-module`,
      `${checkout} 14 Bar.x missing-module`,
      `${checkout} 15 Absent.build missing-module`,
      `${checkout} 17 Gate::Missin.charge missing-module`,
    ]);
  });

  it('reads the library target in place of a Zeitwerk constant that is an alias of a library constant', () => {
    const document = ruleCase('zeitwerk-aliases');
    expect(callsOf(document)).toEqual([]);
    expect(openEndsOf(document)).toEqual([]);
  });

  it('ties send, public_send and try with a literal name like a direct call, and gives dynamic-key for a computed name', () => {
    const document = ruleCase('send');
    expect(callsOf(document)).toEqual([
      'rules/send/lib/robot.rb#Robot#step rules/send/lib/robot.rb#Robot#turn 5',
      'rules/send/lib/robot.rb#Robot#step rules/send/lib/robot.rb#Robot.build 6',
    ]);
    expect(openEndsOf(document)).toEqual([
      'rules/send/lib/robot.rb#Robot#step 7 arm.try untyped',
      'rules/send/lib/robot.rb#Robot#step 8 send dynamic-key',
      'rules/send/lib/robot.rb#Robot#step 9 arm.public_send dynamic-key',
    ]);
  });

  it('gives missing-module before dynamic-key for send with a computed name on a constant that does not resolve', () => {
    expect(openEndsOf(ruleCase('send-missing'))).toEqual([
      'rules/send-missing/lib/robot.rb#Robot#step 3 Ledger.send missing-module',
      'rules/send-missing/lib/robot.rb#Robot#step 4 Ledger.send missing-module',
    ]);
  });

  it('gives function-value for yield and for a call of a block, a callable or a method object', () => {
    expect(openEndsOf(ruleCase('function-value'))).toEqual([
      'rules/function-value/lib/hooks.rb#Hooks#run 3 yield function-value',
      'rules/function-value/lib/hooks.rb#Hooks#run 4 yield function-value',
      'rules/function-value/lib/hooks.rb#Hooks#run 5 block.call function-value',
      'rules/function-value/lib/hooks.rb#Hooks#run 6 callable.() function-value',
      'rules/function-value/lib/hooks.rb#Hooks#run 7 method(:run).call function-value',
      'rules/function-value/lib/hooks.rb#Hooks#run 8 service.call untyped',
      'rules/function-value/lib/hooks.rb#Hooks#run 9 service.method(:call).call function-value',
      'rules/function-value/lib/hooks.rb#Hooks#run 10 self.method(:run).call function-value',
    ]);
  });

  it('gives dynamic-key for send with a splat, and reads a mixin or a macro with a splat', () => {
    const document = ruleCase('send-splat');
    expect(callsOf(document)).toEqual([
      'rules/send-splat/lib/robot.rb#Robot#step rules/send-splat/lib/robot.rb#Robot#turn 7',
    ]);
    expect(openEndsOf(document)).toEqual([
      'rules/send-splat/lib/robot.rb#Robot#step 6 send dynamic-key',
    ]);
  });

  it('gives other for a call on self that only method_missing could answer', () => {
    const document = ruleCase('method-missing');
    expect(callsOf(document)).toEqual([]);
    expect(openEndsOf(document)).toEqual([
      'rules/method-missing/lib/ghost.rb#Ghost#haunt 7 vanish other',
    ]);
  });
});

const oneOfCallsOf = (document: GraphDocument): readonly string[] =>
  document.calls.map(
    ({ caller, callee, line, group }) => `${caller} ${callee} ${line} ${group ?? 'no group'}`,
  );

describe('the one-of groups of extractRuby', () => {
  it('gives a one-of group over each including class for a call on self in a concern with no def of its name', () => {
    const group = 'rules/concern-one-of/app/models/concerns/billable.rb:3:5';
    const document = ruleCase('concern-one-of');
    expect(oneOfCallsOf(document)).toEqual([
      `rules/concern-one-of/app/models/concerns/billable.rb#Billable#invoice rules/concern-one-of/app/models/order.rb#Order#total 3 ${group}`,
      `rules/concern-one-of/app/models/concerns/billable.rb#Billable#invoice rules/concern-one-of/app/models/refund.rb#Refund#total 3 ${group}`,
    ]);
    expect(
      reviewOf({ base: [], branch: [document] }).resolutionRates.map(({ resolved, open }) => ({
        resolved,
        open,
      })),
    ).toEqual([{ resolved: 1, open: 0 }]);
  });

  it('gives a one-of group over each including class for a call on self in a module that includes a library module', () => {
    const group = 'rules/library-include-one-of/lib/billable.rb:5:5';
    const document = ruleCase('library-include-one-of');
    expect(oneOfCallsOf(document)).toEqual([
      `rules/library-include-one-of/lib/billable.rb#Billable#invoice rules/library-include-one-of/lib/order.rb#Order#total 5 ${group}`,
      `rules/library-include-one-of/lib/billable.rb#Billable#invoice rules/library-include-one-of/lib/refund.rb#Refund#total 5 ${group}`,
    ]);
    expect(document.openEnds).toEqual([]);
  });

  it('gives a one-of group over the overrides of the subclasses for a call to an abstract method', () => {
    const group = 'rules/abstract/lib/exporter.rb:3:5';
    expect(oneOfCallsOf(ruleCase('abstract'))).toEqual([
      `rules/abstract/lib/exporter.rb#Exporter#run rules/abstract/lib/csv_exporter.rb#CsvExporter#write 3 ${group}`,
      `rules/abstract/lib/exporter.rb#Exporter#run rules/abstract/lib/json_exporter.rb#JsonExporter#write 3 ${group}`,
    ]);
  });

  it('ties a call to a concrete method that a subclass overrides to the one method', () => {
    expect(oneOfCallsOf(ruleCase('concrete-override'))).toEqual([
      'rules/concrete-override/lib/exporter.rb#Exporter#run rules/concrete-override/lib/exporter.rb#Exporter#write 3 no group',
    ]);
  });

  it('gives no-implementation for a one-of group with no member in scope', () => {
    const document = ruleCase(
      'no-implementation',
      'rules/no-implementation/lib/billable.rb',
      'rules/no-implementation/lib/exporter.rb',
    );
    expect(document.calls).toEqual([]);
    expect(openEndsOf(document)).toEqual([
      'rules/no-implementation/lib/billable.rb#Billable#invoice 3 total no-implementation',
      'rules/no-implementation/lib/exporter.rb#Exporter#run 3 write no-implementation',
    ]);
  });
});

describe('the receivers of a known class in extractRuby', () => {
  it('ties a call on a literal to a method that the repo adds to its library class', () => {
    const document = ruleCase('literals');
    expect(callsOf(document)).toEqual([
      'rules/literals/lib/page.rb#Page#render rules/literals/lib/core_ext.rb#String#slugify 3',
      'rules/literals/lib/page.rb#Page#render rules/literals/lib/core_ext.rb#String#slugify 4',
      'rules/literals/lib/page.rb#Page#render rules/literals/lib/core_ext.rb#Array#second 5',
      'rules/literals/lib/page.rb#Page#render rules/literals/lib/core_ext.rb#Array#second 6',
      'rules/literals/lib/page.rb#Page#render rules/literals/lib/core_ext.rb#Hash#deep_keys 7',
      'rules/literals/lib/page.rb#Page#render rules/literals/lib/core_ext.rb#Symbol#to_label 8',
      'rules/literals/lib/page.rb#Page#render rules/literals/lib/core_ext.rb#Integer#minutes 9',
    ]);
    expect(openEndsOf(document)).toEqual([]);
  });

  it('gives a library call for a call on a literal whose class the repo does not reopen, even when a def of the repo has its name', () => {
    const document = ruleCase('library-literals');
    expect(callsOf(document)).toEqual([]);
    expect(openEndsOf(document)).toEqual([]);
  });

  it('ties a call on Foo.new to the instance method of Foo, and keeps a value that its own new makes untyped', () => {
    const document = ruleCase('new');
    expect(callsOf(document)).toEqual([
      'rules/new/lib/billing/run.rb#Billing::Run#call rules/new/lib/billing/invoice.rb#Billing::Invoice#total 4',
      'rules/new/lib/billing/run.rb#Billing::Run#call rules/new/lib/billing/invoice.rb#Billing::Invoice#total 5',
      'rules/new/lib/billing/run.rb#Billing::Run#call rules/new/lib/billing/invoice.rb#Billing::Invoice#total 6',
      'rules/new/lib/billing/run.rb#Billing::Run#call rules/new/lib/cache.rb#Cache.new 7',
    ]);
    expect(openEndsOf(document)).toEqual([
      'rules/new/lib/billing/run.rb#Billing::Run#call 7 Cache.new.total untyped',
      'rules/new/lib/billing/run.rb#Billing::Run#call 8 Missing.new.total untyped',
    ]);
  });

  it('ties new with no receiver or on self in a singleton method as Foo.new of its class, and gives its value that class, but not in a module', () => {
    const document = ruleCase('singleton-new');
    expect(callsOf(document)).toEqual([
      'rules/singleton-new/lib/copier.rb#Copier.call rules/singleton-new/lib/copier.rb#Copier#call 3',
      'rules/singleton-new/lib/copier.rb#Copier.call rules/singleton-new/lib/copier.rb#Copier#initialize 3',
      'rules/singleton-new/lib/copier.rb#Copier.build rules/singleton-new/lib/copier.rb#Copier#initialize 7',
      'rules/singleton-new/lib/copier.rb#Copier.build rules/singleton-new/lib/copier.rb#Copier#call 8',
      'rules/singleton-new/lib/pool.rb#Pool.checkout rules/singleton-new/lib/pool.rb#Pool.new 5',
      'rules/singleton-new/lib/special_copier.rb#SpecialCopier.make rules/singleton-new/lib/copier.rb#Copier#call 4',
      'rules/singleton-new/lib/special_copier.rb#SpecialCopier.make rules/singleton-new/lib/copier.rb#Copier#initialize 4',
    ]);
    expect(openEndsOf(document)).toEqual([
      'rules/singleton-new/lib/helpers.rb#Helpers.make 3 new other',
      'rules/singleton-new/lib/helpers.rb#Helpers.make 4 made.go untyped',
      'rules/singleton-new/lib/helpers.rb#Helpers.make 5 new.go untyped',
      'rules/singleton-new/lib/helpers.rb#Helpers.make 5 new other',
      'rules/singleton-new/lib/helpers.rb#Helpers.build 12 new.go untyped',
      'rules/singleton-new/lib/helpers.rb#Helpers.build 12 new other',
      'rules/singleton-new/lib/pool.rb#Pool.checkout 5 new.call untyped',
    ]);
  });
});

describe('the local type flow of extractRuby', () => {
  it('ties a call on a local variable that each write of the def sets from Foo.new or a literal', () => {
    const document = ruleCase('local-variables');
    expect(callsOf(document)).toEqual([
      'rules/local-variables/lib/run.rb#Run#call rules/local-variables/lib/invoice.rb#Invoice#total 4',
      'rules/local-variables/lib/run.rb#Run#call rules/local-variables/lib/invoice.rb#Invoice#total 5',
      'rules/local-variables/lib/run.rb#Run#call rules/local-variables/lib/core_ext.rb#String#slugify 7',
      'rules/local-variables/lib/run.rb#Run#call rules/local-variables/lib/invoice.rb#Invoice#total 9',
    ]);
    expect(openEndsOf(document)).toEqual([
      'rules/local-variables/lib/run.rb#Run#call 12 either.total untyped',
      'rules/local-variables/lib/run.rb#Run#call 13 given.total untyped',
      'rules/local-variables/lib/run.rb#Run#call 15 first.total untyped',
      'rules/local-variables/lib/run.rb#Run#call 16 shadowed.total untyped',
    ]);
  });

  it('ties a call on an instance variable that one method alone sets from Foo.new, among every method that an object of the class can run', () => {
    const document = ruleCase('instance-variables');
    expect(callsOf(document)).toEqual([
      'rules/instance-variables/lib/checkout.rb#Checkout#run rules/instance-variables/lib/invoice.rb#Invoice#total 14',
      'rules/instance-variables/lib/checkout.rb#Checkout#run rules/instance-variables/lib/refund.rb#Refund#total 15',
    ]);
    expect(openEndsOf(document)).toEqual([
      'rules/instance-variables/lib/checkout.rb#Checkout#run 16 @note.total untyped',
      'rules/instance-variables/lib/checkout.rb#Checkout#run 17 @other.total untyped',
    ]);
  });

  it('keeps an instance variable untyped when a subclass, a superclass or a module of the object writes it too', () => {
    const document = ruleCase('shared-instance-variables');
    expect(callsOf(document)).toEqual([]);
    expect(openEndsOf(document)).toEqual([
      'rules/shared-instance-variables/lib/base.rb#Base#run 7 @x.total untyped',
      'rules/shared-instance-variables/lib/heir.rb#Heir#run 12 @y.total untyped',
      'rules/shared-instance-variables/lib/heir.rb#Heir#run 13 @z.total untyped',
      'rules/shared-instance-variables/lib/heir.rb#Heir#run 14 @w.total untyped',
    ]);
  });

  it('ties a call on a value that a finder of the library makes, when the class is a model', () => {
    const document = ruleCase('finders');
    expect(callsOf(document)).toEqual([
      'rules/finders/lib/admin.rb#Admin#run rules/finders/lib/account.rb#Account#suspend 7',
      'rules/finders/lib/admin.rb#Admin#run rules/finders/lib/account.rb#Account#suspend 9',
      'rules/finders/lib/admin.rb#Admin#run rules/finders/lib/account.rb#Account#suspend 10',
      'rules/finders/lib/admin.rb#Admin#run rules/finders/lib/vault.rb#Vault.create 12',
      'rules/finders/lib/admin.rb#Admin#run rules/finders/lib/ledger.rb#Ledger.find 13',
    ]);
    expect(openEndsOf(document)).toEqual([
      'rules/finders/lib/admin.rb#Admin#run 11 Account.where(id).suspend untyped',
      'rules/finders/lib/admin.rb#Admin#run 12 Vault.create.suspend untyped',
      'rules/finders/lib/admin.rb#Admin#run 13 Ledger.find(id).suspend untyped',
    ]);
  });
});

const APPLICATION = 'module Store\n  class Application < Rails::Application\n  end\nend\n';

describe('the Zeitwerk names of a Rails app', () => {
  it('names a constant with no body after its file, with the inflections of the app', () => {
    const repo = repoOf({
      'config/application.rb': APPLICATION,
      'config/initializers/inflections.rb':
        'ActiveSupport::Inflector.inflections(:en) do |inflect|\n  inflect.acronym "API"\nend\n',
      'app/models/remote/api_client.rb': 'Remote::APIClient = Struct.new(:key)\n',
      'app/models/socket.rb': 'class Socket\n  def connect; end\nend\n',
      'app/models/sync.rb':
        'class Sync\n  def run\n    Remote::APIClient.connect\n    Remote::ApiClient.connect\n  end\nend\n',
    });
    expect(openEndsOf(extractRuby({ repo }))).toEqual([
      'app/models/sync.rb#Sync#run 4 Remote::ApiClient.connect missing-module',
    ]);
  });

  it('names a constant after its file with an inflection of the Zeitwerk inflector', () => {
    const repo = repoOf({
      'config/application.rb': APPLICATION.replace(
        'Rails::Application\n',
        'Rails::Application\n    config.autoloaders.main.inflector.inflect("csv_export" => "CSVExport")\n',
      ),
      'config/initializers/zeitwerk.rb':
        'Rails.autoloaders.each do |autoloader|\n  autoloader.inflector.inflect("html_parser" => "HTMLParser")\nend\n',
      'app/models/remote/html_parser.rb': 'Remote::HTMLParser = Struct.new(:document)\n',
      'app/models/remote/csv_export.rb': 'Remote::CSVExport = Struct.new(:rows)\n',
      'app/models/socket.rb': 'class Socket\n  def connect; end\nend\n',
      'app/models/sync.rb':
        'class Sync\n  def run\n    Remote::HTMLParser.connect\n    Remote::CSVExport.connect\n    Remote::HtmlParser.connect\n  end\nend\n',
    });
    expect(openEndsOf(extractRuby({ repo }))).toEqual([
      'app/models/sync.rb#Sync#run 5 Remote::HtmlParser.connect missing-module',
    ]);
  });

  it('names the constants of lib when the app autoloads it', () => {
    const files = {
      'lib/payments/gateway.rb': 'Payments::Gateway = ActiveMerchant::Gateway.new\n',
      'app/models/payments/charge.rb': 'Payments::Charge = Struct.new(:amount)\n',
      'app/models/order.rb':
        'class Order\n  def pay\n    Payments::Gateway.connect\n  end\n\n  def connect; end\nend\n',
    };
    const autoloaded = repoOf({
      ...files,
      'config/application.rb': APPLICATION.replace(
        'Rails::Application\n',
        'Rails::Application\n    config.autoload_lib(ignore: %w[assets tasks])\n',
      ),
    });
    const required = repoOf({ ...files, 'config/application.rb': APPLICATION });
    expect(openEndsOf(extractRuby({ repo: autoloaded }))).toEqual([]);
    expect(openEndsOf(extractRuby({ repo: required }))).toEqual([
      'app/models/order.rb#Order#pay 3 Payments::Gateway.connect missing-module',
    ]);
  });

  it('ties a constant of an engine that the Gemfile of the app names by its path, and keeps the app out of the engine', () => {
    const repo = repoOf({
      Gemfile: 'source "https://rubygems.org"\n\ngem "payments", path: "engines/payments"\n',
      'config/application.rb': APPLICATION,
      'engines/payments/payments.gemspec':
        'Gem::Specification.new { |spec| spec.name = "payments" }\n',
      'engines/payments/app/models/payments/charge.rb':
        'module Payments\n  class Charge\n    def self.create; end\n  end\nend\n',
      'engines/payments/app/models/payments/refund.rb':
        'module Payments\n  class Refund\n    def self.issue\n      Order.find_open\n    end\n  end\nend\n',
      'engines/payments/app/models/payments/archive/order.rb':
        'module Payments\n  module Archive\n    class Order\n    end\n  end\nend\n',
      'app/models/order.rb':
        'class Order\n  def self.find_open; end\n\n  def pay\n    Payments::Charge.create\n  end\nend\n',
    });
    const document = extractRuby({ repo });
    expect(callsOf(document)).toEqual([
      'app/models/order.rb#Order#pay engines/payments/app/models/payments/charge.rb#Payments::Charge.create 5',
    ]);
    expect(openEndsOf(document)).toEqual([
      'engines/payments/app/models/payments/refund.rb#Payments::Refund.issue 4 Order.find_open missing-module',
    ]);
  });
});

describe('the checker and the files of extractRuby', () => {
  it('names Callmap Ruby rules with the extractor version and the version of the ruby that ran', () => {
    const { checker } = extract();
    expect(checker.name).toBe('Callmap Ruby rules');
    expect(checker.version).toMatch(/^\d+, ruby \d+\.\d+\.\d+/);
  });

  it('records the scope the document was built under, and claims every Ruby file in it', () => {
    const document = extract('shop/config/**', 'shop/lib/**', 'tools/**');
    expect(document.scope).toEqual(['shop/config/**', 'shop/lib/**', 'tools/**']);
    expect(document.files).toEqual([
      'shop/config/application.rb',
      'shop/config/initializers/slug.rb',
      'shop/lib/core_ext/string.rb',
      'shop/lib/reconcile.rb',
      RELEASE,
    ]);
  });

  it('claims a file that Ripper cannot parse with no functions, and keeps reading the others', () => {
    const document = ruleCase('unparsed');
    expect(document.files).toEqual([
      'rules/unparsed/app/models/broken.rb',
      'rules/unparsed/app/models/cart.rb',
    ]);
    expect(document.functions.map(({ id }) => id)).toEqual([
      'rules/unparsed/app/models/cart.rb#Cart#add',
    ]);
  });

  it('reports a repo it cannot read rather than emitting an empty document', () => {
    expect(() => extractRuby({ repo: join(FIXTURE, 'nowhere') })).toThrow(/nowhere/);
  });
});
