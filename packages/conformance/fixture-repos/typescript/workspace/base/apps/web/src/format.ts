export const format = (cents: number): string => `$${(cents / 100).toFixed(2)}`;
