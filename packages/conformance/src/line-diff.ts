type LineChange = readonly [' ' | '-' | '+', string];

const CONTEXT_LINES = 3;

const commonPrefixLength = (expected: readonly string[], actual: readonly string[]): number => {
  let length = 0;
  while (length < expected.length && length < actual.length && expected[length] === actual[length])
    length += 1;
  return length;
};

const commonSuffixLength = (
  expected: readonly string[],
  actual: readonly string[],
  prefix: number,
): number => {
  let length = 0;
  while (
    length < expected.length - prefix &&
    length < actual.length - prefix &&
    expected[expected.length - 1 - length] === actual[actual.length - 1 - length]
  )
    length += 1;
  return length;
};

const changesBetween = (
  expected: readonly string[],
  actual: readonly string[],
): readonly LineChange[] => {
  const width = actual.length + 1;
  const common = new Uint32Array((expected.length + 1) * width);
  const commonAt = (row: number, column: number): number => common[row * width + column] ?? 0;
  for (let row = expected.length - 1; row >= 0; row -= 1)
    for (let column = actual.length - 1; column >= 0; column -= 1)
      common[row * width + column] =
        expected[row] === actual[column]
          ? commonAt(row + 1, column + 1) + 1
          : Math.max(commonAt(row + 1, column), commonAt(row, column + 1));
  const changes: LineChange[] = [];
  let row = 0;
  let column = 0;
  while (row < expected.length || column < actual.length) {
    if (row < expected.length && column < actual.length && expected[row] === actual[column]) {
      changes.push([' ', expected[row] ?? '']);
      row += 1;
      column += 1;
    } else if (
      column === actual.length ||
      (row < expected.length && commonAt(row + 1, column) >= commonAt(row, column + 1))
    ) {
      changes.push(['-', expected[row] ?? '']);
      row += 1;
    } else {
      changes.push(['+', actual[column] ?? '']);
      column += 1;
    }
  }
  return changes;
};

const nearAChange = (changes: readonly LineChange[], index: number): boolean =>
  changes
    .slice(Math.max(0, index - CONTEXT_LINES), index + CONTEXT_LINES + 1)
    .some(([kind]) => kind !== ' ');

export const lineDiffOf = (expectedText: string, actualText: string): string => {
  const expected = expectedText.split('\n');
  const actual = actualText.split('\n');
  const prefix = commonPrefixLength(expected, actual);
  const suffix = commonSuffixLength(expected, actual, prefix);
  const changes: readonly LineChange[] = [
    ...expected.slice(0, prefix).map((line): LineChange => [' ', line]),
    ...changesBetween(
      expected.slice(prefix, expected.length - suffix),
      actual.slice(prefix, actual.length - suffix),
    ),
    ...expected.slice(expected.length - suffix).map((line): LineChange => [' ', line]),
  ];
  const lines = ['--- expected', '+++ actual'];
  let expectedLine = 0;
  let shownBefore = false;
  changes.forEach(([kind, line], index) => {
    if (kind !== '+') expectedLine += 1;
    if (!nearAChange(changes, index)) {
      shownBefore = false;
      return;
    }
    if (!shownBefore) lines.push(`@@ line ${expectedLine} of the expected file @@`);
    shownBefore = true;
    lines.push(`${kind} ${line}`);
  });
  return lines.join('\n');
};
