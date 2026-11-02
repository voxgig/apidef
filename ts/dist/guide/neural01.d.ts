import type { Net } from './nn';
import type { ApiDefContext, Guide } from '../types';
declare const GUIDE_NETS: string[];
declare function guideNets(): Record<string, Net>;
declare function neural01(ctx: ApiDefContext): Promise<Guide>;
export { neural01, guideNets, GUIDE_NETS, };
