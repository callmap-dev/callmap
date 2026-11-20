import { rounded } from '@shop/money';

export const taxed = (cents: number): number => rounded(cents * 1.2);
