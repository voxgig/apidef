import type { Net } from './nn';
import type { ApiDefContext, Guide } from '../types';
declare const NETS: Record<string, Net>;
declare function neural01(ctx: ApiDefContext): Promise<Guide>;
export { neural01, NETS, };
