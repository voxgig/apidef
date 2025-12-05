import type { TransformResult } from '../transform';
import type { GuidePath, PathDesc, OpDesc } from '../desc';
import type { OpName } from '../model';
type GuideEntity = {
    name: string;
    path: Record<string, GuidePath>;
    paths$: PathDesc[];
    opm$: Record<OpName, OpDesc>;
};
declare const topTransform: (ctx: any) => Promise<TransformResult>;
export { topTransform };
export type { GuideEntity, };
