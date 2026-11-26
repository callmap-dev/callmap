import type { GraphDocument } from '@callmap/graph-document';

export const checkerOf = (documents: readonly GraphDocument[]): string =>
  [...new Set(documents.map(({ checker }) => `${checker.name} ${checker.version}`))].join(', ');
