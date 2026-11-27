const longestBacktickRunOf = (text: string): number =>
  Math.max(0, ...[...text.matchAll(/`+/g)].map(([run]) => run.length));

export const codeOf = (text: string): string => {
  const fence = '`'.repeat(Math.max(3, longestBacktickRunOf(text) + 1));
  return `${fence}\n${text}\n${fence}`;
};

export const inlineCodeOf = (text: string): string => {
  const ticks = '`'.repeat(longestBacktickRunOf(text) + 1);
  return text.startsWith('`') || text.endsWith('`')
    ? `${ticks} ${text} ${ticks}`
    : `${ticks}${text}${ticks}`;
};
