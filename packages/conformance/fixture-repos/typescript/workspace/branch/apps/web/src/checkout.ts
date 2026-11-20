import { format } from '@/format';
import { taxed } from '@/tax';

export const checkout = (cents: number): string => format(taxed(cents));
