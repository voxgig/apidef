import type { Transform } from '../transform';
import type { GuideEntity, PathDesc } from './top';
declare const entityTransform: Transform;
declare function resolvePathList(guideEntity: GuideEntity, def: {
    paths: Record<string, any>;
}): PathDesc[];
declare function buildRelations(guideEntity: any, paths$: PathDesc[]): {
    ancestors: any[];
};
export { resolvePathList, buildRelations, entityTransform, };
