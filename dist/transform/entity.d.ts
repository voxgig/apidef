import type { TransformResult } from '../transform';
import type { GuideEntity } from '../types';
import type { PathDesc } from '../desc';
declare const entityTransform: (ctx: any) => Promise<TransformResult>;
declare function resolvePathList(guideEntity: GuideEntity, def: {
    paths: Record<string, any>;
}): PathDesc[];
declare function buildRelations(guideEntity: any, paths$: PathDesc[]): {
    ancestors: any[];
};
export { resolvePathList, buildRelations, entityTransform, };
