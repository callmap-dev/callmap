import { format } from '@/format';

export const checkout = (cents: number): string => format(cents);
