import { rounded } from '@shop/money';
import { format } from '@/format';

export const dashboard = (count: number): string => `Orders: ${format(rounded(count))}`;
