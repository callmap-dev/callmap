const withSortedKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(withSortedKeys);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, withSortedKeys(Reflect.get(value, key))]),
  );
};

export const canonicalJsonOf = (value: unknown): string =>
  `${JSON.stringify(withSortedKeys(value), null, 2)}\n`;
