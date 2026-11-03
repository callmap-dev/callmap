import type { FunctionId, OpenEndReason } from '@callmap/graph-document';
import { madeNamesOf } from './macros.ts';
import { LITERAL_CLASSES, sideOf } from './ripper.ts';
import type {
  CallSite,
  ConstantAlias,
  ConstantReference,
  Mixin,
  RubyBody,
  RubyMethod,
  Side,
} from './ripper.ts';
import { typeFlowOf } from './type-flow.ts';

export interface IndexedMethod extends RubyMethod {
  readonly id: FunctionId;
  readonly file: string;
}

export type Resolution =
  | { readonly kind: 'call'; readonly callee: FunctionId }
  | { readonly kind: 'one-of'; readonly callees: readonly FunctionId[] }
  | { readonly kind: 'open-end'; readonly reason: OpenEndReason }
  | { readonly kind: 'library' };

/** Ties one call site of a method of the load unit. */
export type Resolver = (site: CallSite, caller: RubyMethod) => Resolution;

/** What one load unit holds: every body and every `def` of its files, under one set of names. */
export interface LoadUnitIndex {
  readonly bodies: readonly RubyBody[];
  readonly methods: readonly IndexedMethod[];
  /** The constants that exist with no body of their own, such as a name that Zeitwerk derives. */
  readonly names: readonly string[];
  readonly aliases: readonly ConstantAlias[];
}

/** Every body of one full name in a load unit, merged, as Ruby merges them. */
export interface RubyClass {
  readonly name: string;
  readonly bodies: RubyBody[];
  readonly instance: Map<string, IndexedMethod>;
  readonly singleton: Map<string, IndexedMethod>;
  /** The names that a macro of a body makes, on each side. */
  readonly macroNames: Record<Side, Set<string>>;
}

/** One step of a class chain: the methods of one side of a class, or a class outside the repo. */
export type Ancestor = { readonly owner: RubyClass; readonly side: Side } | 'library';

export type Found = IndexedMethod | 'library' | 'none';

/** Why a call that ties to no method of the repo is an open end, if its name has a def. */
type Unproved = Extract<OpenEndReason, 'missing-module' | 'untyped' | 'other'>;

/** What each class below a module or an abstract method finds for the name, one of which runs. */
interface OneOf {
  readonly oneOf: readonly Found[];
}

const LIBRARY: Resolution = { kind: 'library' };

const namespacesOf = (name: string): readonly string[] => {
  const segments = name.split('::');
  return segments.map((_, index) => segments.slice(0, index + 1).join('::'));
};

/** What a load unit knows of its constant references. */
export interface Constants {
  /** The full name of the unit that a reference resolves to, if any. */
  readonly constantOf: (reference: ConstantReference) => string | undefined;
  /**
   * Whether a reference that does not resolve names a constant of a library: no body of the unit
   * and no Zeitwerk name has a segment named as its first segment, and the first segment resolves
   * to no constant of the repo. An alias whose target does not resolve stands for its target.
   */
  readonly isLibrary: (reference: ConstantReference) => boolean;
}

/**
 * Resolves a constant reference in the lexical nesting to a full name of the load unit. A name
 * that an alias makes stands for the constant that its target resolves to, through a chain of
 * aliases. When the target does not resolve, as in a cycle of aliases, the name resolves as it
 * would with no alias.
 */
export const constantIndexOf = (
  bodies: readonly RubyBody[],
  names: readonly string[],
  aliases: readonly ConstantAlias[],
): Constants => {
  const targets = new Map(aliases.map(({ name, target }) => [name, target]));
  const fullNames = [...bodies.map(({ name }) => name), ...names];
  const declared = new Set(fullNames.flatMap(namespacesOf));
  const constants = new Set([...declared, ...[...targets.keys()].flatMap(namespacesOf)]);
  const segments = new Set(fullNames.flatMap((name) => name.split('::')));

  const followed = (name: string, seen: ReadonlySet<string>): string | undefined => {
    const target = targets.get(name);
    if (target === undefined) return name;
    const followedTarget = seen.has(name) ? undefined : resolved(target, new Set([...seen, name]));
    return followedTarget ?? (declared.has(name) ? name : undefined);
  };

  /** A constant is not set yet while its own assignment reads its target, so the lookup skips it. */
  const lexicalOf = (
    { nesting, path, absolute }: ConstantReference,
    seen: ReadonlySet<string>,
  ): string | undefined => {
    const [head] = path;
    if (head === undefined) return undefined;
    const lexical = absolute
      ? [head]
      : [...nesting.map((namespace) => [...namespace, head].join('::')), head];
    return lexical.find((candidate) => constants.has(candidate) && !seen.has(candidate));
  };

  const resolved = (
    reference: ConstantReference,
    seen: ReadonlySet<string>,
  ): string | undefined => {
    const found = lexicalOf(reference, seen);
    return reference.path.slice(1).reduce<string | undefined>(
      (outer, segment) => {
        const full = `${outer}::${segment}`;
        return outer !== undefined && constants.has(full) ? followed(full, seen) : undefined;
      },
      found && followed(found, seen),
    );
  };

  /** A Zeitwerk name can also be an alias, so a broken alias can still resolve as a name. */
  const isBroken = (name: string, seen: ReadonlySet<string>): boolean => {
    const target = targets.get(name);
    if (target === undefined) return false;
    return seen.has(name) || resolved(target, new Set([...seen, name])) === undefined;
  };

  /** The first alias on the path of a reference whose target does not resolve, if any. */
  const brokenAliasOf = (
    reference: ConstantReference,
    seen: ReadonlySet<string>,
  ): string | undefined => {
    let name = lexicalOf(reference, seen);
    for (const segment of reference.path.slice(1)) {
      if (name === undefined) return undefined;
      if (isBroken(name, seen)) return name;
      const outer = followed(name, seen);
      name =
        outer !== undefined && constants.has(`${outer}::${segment}`)
          ? `${outer}::${segment}`
          : undefined;
    }
    return name !== undefined && isBroken(name, seen) ? name : undefined;
  };

  const isLibrary = (reference: ConstantReference, seen: ReadonlySet<string>): boolean => {
    const broken = brokenAliasOf(reference, seen);
    const target = broken === undefined ? undefined : targets.get(broken);
    if (broken !== undefined && target !== undefined && !seen.has(broken))
      return isLibrary(target, new Set([...seen, broken]));
    const first = lexicalOf(reference, seen);
    const firstConstant = first === undefined ? undefined : followed(first, seen);
    if (firstConstant !== undefined && declared.has(firstConstant)) return false;
    const [head] = reference.path;
    return head !== undefined && !segments.has(head);
  };

  return {
    constantOf: (reference) => resolved(reference, new Set()),
    isLibrary: (reference) => isLibrary(reference, new Set()),
  };
};

export const resolverOf = (
  unit: LoadUnitIndex,
  definedNames: ReadonlySet<string>,
  claimed: ReadonlySet<string>,
): Resolver => {
  const classes = new Map<string, RubyClass>();
  const classOf = (name: string): RubyClass => {
    const known = classes.get(name) ?? {
      name,
      bodies: [],
      instance: new Map(),
      singleton: new Map(),
      macroNames: { instance: new Set(), singleton: new Set() },
    };
    classes.set(name, known);
    return known;
  };
  for (const body of unit.bodies) {
    const owner = classOf(body.name);
    owner.bodies.push(body);
    for (const macro of body.macros) {
      const { side, names } = madeNamesOf(macro);
      for (const name of names) owner.macroNames[side].add(name);
    }
  }
  for (const method of unit.methods) {
    const methods = classOf(method.owner)[sideOf(method)];
    const known = methods.get(method.name);
    if (known === undefined || claimed.has(method.file) || !claimed.has(known.file))
      methods.set(method.name, method);
  }
  const { constantOf, isLibrary } = constantIndexOf(unit.bodies, unit.names, unit.aliases);

  const mixinsOf = (owner: RubyClass, kind: Mixin['kind']) =>
    owner.bodies
      .flatMap(({ mixins }) => mixins)
      .filter((mixin) => mixin.kind === kind)
      .reverse();

  /** A module as a mixin brings its prepends, its own methods, then its includes. */
  const moduleChainOf = (reference: ConstantReference, seen: Set<string>): readonly Ancestor[] => {
    const name = constantOf(reference);
    const owner = name === undefined ? undefined : classes.get(name);
    if (owner === undefined) return ['library'];
    const step = `instance ${owner.name}`;
    if (seen.has(step)) return [];
    seen.add(step);
    return [
      ...mixinsOf(owner, 'prepend').flatMap((mixin) => moduleChainOf(mixin, seen)),
      { owner, side: 'instance' },
      ...mixinsOf(owner, 'include').flatMap((mixin) => moduleChainOf(mixin, seen)),
    ];
  };

  /** A class that includes a Rails concern is extended with the `ClassMethods` of the concern. */
  const classMethodsOf = (reference: ConstantReference, seen: Set<string>): readonly Ancestor[] => {
    const name = constantOf(reference);
    const classMethods = `${name}::ClassMethods`;
    if (name === undefined || !classes.has(classMethods)) return [];
    return moduleChainOf({ nesting: [], path: classMethods.split('::'), absolute: true }, seen);
  };

  const superclassOf = (owner: RubyClass): ConstantReference | null =>
    owner.bodies.find(({ superclass }) => superclass !== null)?.superclass ?? null;

  const chainOf = (name: string, side: Side, seen: Set<string>): readonly Ancestor[] => {
    const owner = classes.get(name);
    if (owner === undefined) return ['library'];
    const step = `${side} ${name}`;
    if (seen.has(step)) return [];
    seen.add(step);
    const own: Ancestor[] =
      side === 'instance'
        ? [
            ...mixinsOf(owner, 'prepend').flatMap((mixin) => moduleChainOf(mixin, seen)),
            { owner, side },
            ...mixinsOf(owner, 'include').flatMap((mixin) => moduleChainOf(mixin, seen)),
          ]
        : [
            ...mixinsOf(owner, 'singleton-prepend').flatMap((mixin) => moduleChainOf(mixin, seen)),
            { owner, side },
            ...mixinsOf(owner, 'extend').flatMap((mixin) => moduleChainOf(mixin, seen)),
            ...mixinsOf(owner, 'include').flatMap((mixin) => classMethodsOf(mixin, seen)),
          ];
    const superclass = superclassOf(owner);
    if (superclass === null) return LITERAL_CLASSES.has(name) ? [...own, 'library'] : own;
    const parent = constantOf(superclass);
    if (parent === undefined) return [...own, 'library'];
    return [...own, ...chainOf(parent, side, seen)];
  };

  const chains = new Map<string, readonly Ancestor[]>();
  const chainFor = (name: string, side: Side): readonly Ancestor[] => {
    const key = `${side} ${name}`;
    const known = chains.get(key) ?? chainOf(name, side, new Set());
    chains.set(key, known);
    return known;
  };

  const isModule = (name: string): boolean =>
    classes.get(name)?.bodies.some((body) => body.module) ?? false;

  /** The classes, each with the side of its chain, that have this step in their chain. */
  const below = new Map<string, readonly { readonly name: string; readonly side: Side }[]>();
  const classesBelow = (owner: string, side: Side) => {
    const key = `${side} ${owner}`;
    const known =
      below.get(key) ??
      [...classes.keys()]
        .filter((name) => !isModule(name))
        .flatMap((name) =>
          (['instance', 'singleton'] as const).map((chainSide) => ({ name, side: chainSide })),
        )
        .filter(({ name, side: chainSide }) =>
          chainFor(name, chainSide).some(
            (ancestor) =>
              ancestor !== 'library' && ancestor.owner.name === owner && ancestor.side === side,
          ),
        );
    below.set(key, known);
    return known;
  };

  const findIn = (chain: readonly Ancestor[], name: string): Found => {
    for (const ancestor of chain) {
      if (ancestor === 'library') return 'library';
      const method = ancestor.owner[ancestor.side].get(name);
      if (method !== undefined) return method;
      if (ancestor.owner.macroNames[ancestor.side].has(name)) return 'library';
    }
    return 'none';
  };

  /** What `super` in a method of the owner finds: the first def of the name after the owner. */
  const superOf = (chain: readonly Ancestor[], owner: string, side: Side, name: string): Found => {
    const own = chain.findIndex(
      (ancestor) =>
        ancestor !== 'library' && ancestor.owner.name === owner && ancestor.side === side,
    );
    return findIn(chain.slice(own + 1), name);
  };

  const oneOfBelow = (owner: string, side: Side, name: string): OneOf => ({
    oneOf: classesBelow(owner, side).map((each) => findIn(chainFor(each.name, each.side), name)),
  });

  const overridesOf = (found: Found, owner: string, side: Side, name: string): Found | OneOf =>
    typeof found !== 'string' && found.abstract ? oneOfBelow(owner, side, name) : found;

  const typeFlow = typeFlowOf(
    { classes, constantOf, superclassOf, chainFor, classesBelow, findIn, isModule },
    unit.methods,
  );

  const calleeOf = (site: CallSite, caller: RubyMethod): Found | Unproved | OneOf => {
    const { receiver, name } = site;
    const callerSide = sideOf(caller);
    if (receiver.kind === 'self') {
      const found = findIn(chainFor(caller.owner, callerSide), name);
      const unfound =
        found === 'none' ||
        (found === 'library' && classesBelow(caller.owner, callerSide).length > 0);
      if (unfound && callerSide === 'instance' && isModule(caller.owner))
        return oneOfBelow(caller.owner, callerSide, name);
      return overridesOf(found, caller.owner, callerSide, name);
    }
    if (receiver.kind === 'super') {
      const found = superOf(chainFor(caller.owner, callerSide), caller.owner, callerSide, name);
      if (found !== 'none') return found;
      if (callerSide !== 'instance' || !isModule(caller.owner)) return 'library';
      return {
        oneOf: classesBelow(caller.owner, callerSide).map((each) =>
          superOf(chainFor(each.name, each.side), caller.owner, callerSide, name),
        ),
      };
    }
    if (receiver.kind === 'value') return 'untyped';
    if (receiver.kind === 'made' || receiver.kind === 'variable') {
      const known = typeFlow(receiver, caller);
      if (known === undefined) return 'untyped';
      const found = findIn(chainFor(known.className, 'instance'), name);
      return overridesOf(found, known.className, 'instance', name);
    }
    const constant = constantOf(receiver);
    if (constant === undefined) return isLibrary(receiver) ? 'library' : 'missing-module';
    if (name !== 'new')
      return overridesOf(
        findIn(chainFor(constant, 'singleton'), name),
        constant,
        'singleton',
        name,
      );
    const ownNew = findIn(chainFor(constant, 'singleton'), 'new');
    if (ownNew !== 'none' && ownNew !== 'library') return ownNew;
    const initialize = findIn(chainFor(constant, 'instance'), 'initialize');
    return initialize === 'none' ? 'library' : initialize;
  };

  const oneOfAmong = (found: readonly Found[], name: string): Resolution => {
    const callees = new Set(
      found.flatMap((method) =>
        typeof method !== 'string' && !method.abstract && claimed.has(method.file)
          ? [method.id]
          : [],
      ),
    );
    if (callees.size > 0) return { kind: 'one-of', callees: [...callees] };
    if (found.includes('library') || !definedNames.has(name)) return LIBRARY;
    return { kind: 'open-end', reason: 'no-implementation' };
  };

  const moduleNewAsSelf = (site: CallSite): CallSite => {
    const { receiver } = site;
    if (receiver.kind !== 'constant' || receiver.selfNew !== true) return site;
    const owner = constantOf(receiver);
    return owner !== undefined && isModule(owner) ? { ...site, receiver: { kind: 'self' } } : site;
  };

  return (written: CallSite, caller: RubyMethod): Resolution => {
    const site = moduleNewAsSelf(written);
    if (site.open !== undefined) {
      const missing = site.receiver.kind === 'constant' && constantOf(site.receiver) === undefined;
      if (missing && isLibrary(site.receiver)) return LIBRARY;
      return { kind: 'open-end', reason: missing ? 'missing-module' : site.open };
    }
    const callee = calleeOf(site, caller);
    if (callee === 'library') return LIBRARY;
    if (typeof callee !== 'string' && 'oneOf' in callee) return oneOfAmong(callee.oneOf, site.name);
    if (typeof callee !== 'string')
      return claimed.has(callee.file) ? { kind: 'call', callee: callee.id } : LIBRARY;
    if (site.name === 'new' && site.receiver.kind === 'constant') return LIBRARY;
    if (!definedNames.has(site.name)) return LIBRARY;
    return { kind: 'open-end', reason: callee === 'none' ? 'other' : callee };
  };
};
