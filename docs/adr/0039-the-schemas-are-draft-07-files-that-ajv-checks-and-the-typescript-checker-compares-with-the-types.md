# The schemas are draft-07 files that Ajv checks, and the TypeScript checker compares them with the types

The core holds a JSON Schema of the graph document and a JSON Schema of the review input, as spec 24 asks. A distribution in any language can check its output against them. This ADR records the form of the schemas, the validator of the tests and the new kind of test that keeps the schemas and the types together. It was decided in the build of issue 27 on 2026-11-07.

## Decisions

1. **One schema file next to its type.** `packages/graph-document/graph-document.schema.json` describes `GraphDocument`. `packages/review-input/review-input.schema.json` describes `ReviewInput`. The review input schema refers to the graph document schema by the relative name `graph-document.schema.json`, so the 2 files work side by side, as in the release assets.
2. **JSON Schema draft-07.** Each schema names draft-07 in `$schema`. Each object closes with `additionalProperties: false`, as the reader of the graph document refuses a field that the contract does not allow.
3. **No lookahead in a pattern.** The Go `regexp` package has no lookahead, and Go validators use it. So the pattern of a file path spells the rules of `requirePath` with alternatives only.
4. **The tests check with Ajv 6.** `test/schemas.ts` compiles both schemas with Ajv 6. Ajv 6 reads draft-07. `runCallmap`, the helper that each CLI test uses to run the command, checks the review input of each page and each graph document of the base cache against the schemas. A mismatch fails the test that ran the command.
5. **A test compares the schemas with the types.** `test/schemas-agree-with-the-types.test.ts` reads `GraphDocument` and `ReviewInput` with the TypeScript checker and builds a shape for each one: the fields, which fields are optional, the kind of each value and each set of literals. It builds the same shape from each schema and compares the 2. A field of the type that holds `undefined` is optional in the shape, because JSON drops it. The shape leaves out what a type cannot say, such as a pattern or a minimum.

## Why

- **A JSON file is the form that every language reads.** A schema in TypeScript code would need a build step before a Go or a Ruby distribution could use it.
- **Draft-07 has the widest support.** Go and Ruby have mature validators for draft-07. A later draft adds nothing that these 2 schemas need.
- **Ajv 6 is in `node_modules` already.** ESLint depends on it. A check of the schemas needs a validator, and a hand-made validator would check less than the schemas say.
- **The TypeScript checker reads the types as the compiler does.** `typescript` is a dependency already. A generator from the types to a schema would need a new dependency, and the schemas say more than the types, such as the path pattern.

## Considered options

- **Generate the schemas from the types.** The schemas would follow each type change with no test. But a generator needs a new dependency, and a type cannot carry the pattern of a path, the minimum of a line or the rule of a text with no white space only.
- **Derive the types from the schemas.** It needs a new dependency, and the types would lose their names in the code.
- **Ajv 8 or a later draft.** It needs a new dependency in the lockfile, and draft-07 is enough.

## Consequences

- **A change to a type fails the test until the schema changes, and the other way round.** This covers a new field, a removed field, a change of the optional mark, a change of the value kind and a change to a set of literals, such as the open-end reasons or the editor names.
- **The root manifest must name Ajv.** The tests import `ajv` from the tree of ESLint. The root `package.json` must list `ajv` `^6.15.0` as a dev dependency, with a lockfile from `npm install`, so that an ESLint update cannot remove it.
- **The schemas do not check a rule that joins 2 fields.** A caller that is a function of the document, a last line after the first line and one call site for each one-of group stay in `readGraphDocument`.
- **The CLI tests run slower by the time of the checks.** Ajv compiles each schema once for each test file.
