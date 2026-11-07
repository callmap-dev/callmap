import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Ajv from 'ajv';

const REPO_ROOT = join(import.meta.dirname, '..');

export const GRAPH_DOCUMENT_SCHEMA_PATH = 'packages/graph-document/graph-document.schema.json';

export const REVIEW_INPUT_SCHEMA_PATH = 'packages/review-input/review-input.schema.json';

export type Schema = Readonly<Record<string, unknown>>;

export const schemaAt = (path: string): Schema =>
  JSON.parse(readFileSync(join(REPO_ROOT, path), 'utf8')) as Schema;

const ajv = new Ajv({ allErrors: true });

const validatorOf = (path: string) => {
  const schema = schemaAt(path);
  ajv.addSchema(schema);
  const validate = ajv.getSchema(String(schema['$id']));
  if (validate === undefined) throw new Error(`the schema ${path} has no $id`);
  return validate;
};

const validateGraphDocument = validatorOf(GRAPH_DOCUMENT_SCHEMA_PATH);
const validateReviewInput = validatorOf(REVIEW_INPUT_SCHEMA_PATH);

type Validate = typeof validateGraphDocument;

const problemsOf = (validate: Validate, value: unknown): readonly string[] =>
  validate(value) === true
    ? []
    : (validate.errors ?? []).map((error) => `${error.dataPath} ${error.message ?? ''}`.trim());

export const graphDocumentProblemsOf = (value: unknown): readonly string[] =>
  problemsOf(validateGraphDocument, value);

export const reviewInputProblemsOf = (value: unknown): readonly string[] =>
  problemsOf(validateReviewInput, value);
