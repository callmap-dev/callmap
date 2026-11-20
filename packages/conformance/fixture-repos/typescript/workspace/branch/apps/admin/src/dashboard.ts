import { rounded } from '@shop/money';
import { toast } from 'sonner';
import { format } from '@/format';

export const dashboard = (count: number): string => `Orders: ${format(rounded(count))}`;

export const notify = (count: number): void => toast(dashboard(count));
