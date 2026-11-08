import { join } from 'node:path';
import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { GRAPH_DOCUMENT_SCHEMA_PATH, REVIEW_INPUT_SCHEMA_PATH, schemaAt } from './schemas.ts';
import type { Schema } from './schemas.ts';

type Shape =
  | { readonly kind: 'string' | 'number' | 'boolean' }
  | { readonly kind: 'enum'; readonly values: readonly (string | number)[] }
  | { readonly kind: 'array'; readonly items: Shape }
  | { readonly kind: 'object'; readonly properties: Readonly<Record<string, Field>> };

interface Field {
  readonly shape: Shape;
  readonly optional: boolean;
}

const REPO_ROOT = join(import.meta.dirname, '..');

const sorted = (values: readonly (string | number)[]): readonly (string | number)[] =>
  [...values].sort((left, right) => String(left).localeCompare(String(right)));

const programOf = (entries: readonly string[]): ts.Program => {
  const config = ts.readConfigFile(join(REPO_ROOT, 'tsconfig.json'), (path) =>
    ts.sys.readFile(path),
  );
  const { options } = ts.parseJsonConfigFileContent(config.config, ts.sys, REPO_ROOT);
  return ts.createProgram({
    rootNames: entries.map((entry) => join(REPO_ROOT, entry)),
    options,
  });
};

const GRAPH_DOCUMENT_ENTRY = 'packages/graph-document/src/index.ts';
const REVIEW_INPUT_ENTRY = 'packages/review-input/src/index.ts';

const program = programOf([GRAPH_DOCUMENT_ENTRY, REVIEW_INPUT_ENTRY]);
const checker = program.getTypeChecker();

const exportedType = (entry: string, name: string): ts.Type => {
  const source = program.getSourceFile(join(REPO_ROOT, entry));
  const module = source === undefined ? undefined : checker.getSymbolAtLocation(source);
  if (module === undefined) throw new Error(`the program holds no module ${entry}`);
  const exported = checker.getExportsOfModule(module).find((symbol) => symbol.name === name);
  if (exported === undefined) throw new Error(`${entry} exports no type ${name}`);
  return checker.getDeclaredTypeOfSymbol(checker.getAliasedSymbol(exported));
};

const literalOf = (type: ts.Type): string | number | undefined =>
  type.isStringLiteral() || type.isNumberLiteral() ? type.value : undefined;

const shapeOfType = (type: ts.Type): Shape => {
  if (type.flags & ts.TypeFlags.String) return { kind: 'string' };
  if (type.flags & ts.TypeFlags.Number) return { kind: 'number' };
  if (type.flags & ts.TypeFlags.Boolean) return { kind: 'boolean' };
  const literals = (type.isUnion() ? type.types : [type]).map(literalOf);
  if (literals.every((literal) => literal !== undefined))
    return { kind: 'enum', values: sorted(literals) };
  if (checker.isArrayType(type)) {
    const [items] = checker.getTypeArguments(type as ts.TypeReference);
    if (items === undefined) throw new Error('an array type with no item type');
    return { kind: 'array', items: shapeOfType(items) };
  }
  if (type.flags & ts.TypeFlags.Object)
    return {
      kind: 'object',
      properties: Object.fromEntries(
        checker.getPropertiesOfType(type).map((property) => {
          const propertyType = checker.getTypeOfSymbol(property);
          const optional =
            (property.flags & ts.SymbolFlags.Optional) !== 0 ||
            (propertyType.isUnion() &&
              propertyType.types.some((member) => member.flags & ts.TypeFlags.Undefined));
          return [
            property.name,
            { shape: shapeOfType(checker.getNonNullableType(propertyType)), optional },
          ];
        }),
      ),
    };
  throw new Error(`the type ${checker.typeToString(type)} has no JSON shape`);
};

const SCHEMAS: Readonly<Record<string, Schema>> = {
  'graph-document.schema.json': schemaAt(GRAPH_DOCUMENT_SCHEMA_PATH),
  'review-input.schema.json': schemaAt(REVIEW_INPUT_SCHEMA_PATH),
};

const LOCAL_REF = '#/definitions/';

const resolved = (schema: Schema, root: Schema): readonly [Schema, Schema] => {
  const ref = schema['$ref'];
  if (typeof ref !== 'string') return [schema, root];
  if (ref.startsWith(LOCAL_REF)) {
    const definitions = root['definitions'] as Readonly<Record<string, Schema>> | undefined;
    const definition = definitions?.[ref.slice(LOCAL_REF.length)];
    if (definition === undefined) throw new Error(`the schema defines no ${ref}`);
    return resolved(definition, root);
  }
  const other = SCHEMAS[ref];
  if (other === undefined) throw new Error(`no schema has the name ${ref}`);
  return resolved(other, other);
};

const shapeOfSchema = (unresolved: Schema, unresolvedRoot: Schema): Shape => {
  const [schema, root] = resolved(unresolved, unresolvedRoot);
  if ('const' in schema) return { kind: 'enum', values: [schema['const'] as string | number] };
  if ('enum' in schema)
    return { kind: 'enum', values: sorted(schema['enum'] as readonly (string | number)[]) };
  switch (schema['type']) {
    case 'string':
    case 'boolean':
      return { kind: schema['type'] };
    case 'integer':
    case 'number':
      return { kind: 'number' };
    case 'array':
      return { kind: 'array', items: shapeOfSchema(schema['items'] as Schema, root) };
    case 'object': {
      if (schema['additionalProperties'] !== false)
        throw new Error('an object of the schema allows fields that the type does not name');
      const required = (schema['required'] ?? []) as readonly string[];
      const properties = schema['properties'] as Readonly<Record<string, Schema>>;
      return {
        kind: 'object',
        properties: Object.fromEntries(
          Object.entries(properties).map(([name, property]) => [
            name,
            { shape: shapeOfSchema(property, root), optional: !required.includes(name) },
          ]),
        ),
      };
    }
    default:
      throw new Error(`the schema type ${JSON.stringify(schema['type'])} has no shape`);
  }
};

describe('the JSON Schemas', () => {
  it('describe the GraphDocument type of the graph document package, field by field', () => {
    const schema = SCHEMAS['graph-document.schema.json'] ?? {};
    expect(shapeOfSchema(schema, schema)).toEqual(
      shapeOfType(exportedType(GRAPH_DOCUMENT_ENTRY, 'GraphDocument')),
    );
  });

  it('describe the ReviewInput type of the review input package, field by field', () => {
    const schema = SCHEMAS['review-input.schema.json'] ?? {};
    expect(shapeOfSchema(schema, schema)).toEqual(
      shapeOfType(exportedType(REVIEW_INPUT_ENTRY, 'ReviewInput')),
    );
  });
});
