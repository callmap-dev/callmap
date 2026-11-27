const UINT32_RANGE = 2 ** 32;

export const MAX_SEED = UINT32_RANGE - 1;

/** Mulberry32, so that each Node version draws the same numbers for one seed. */
const generatorOf = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / UINT32_RANGE;
  };
};

export const seededSampleOf = <Item>(
  items: readonly Item[],
  count: number,
  seed: number,
): readonly Item[] => {
  const next = generatorOf(seed);
  const shuffled = [...items];
  for (let index = 0; index < count; index += 1) {
    const pick = index + Math.floor(next() * (shuffled.length - index));
    [shuffled[index], shuffled[pick]] = [shuffled[pick] as Item, shuffled[index] as Item];
  }
  return shuffled.slice(0, count);
};
