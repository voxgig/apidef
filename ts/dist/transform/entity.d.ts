import type { Transform } from '../transform';
import type { GuideEntity } from '../types';
import type { PathDesc } from '../desc';
declare const entityTransform: Transform;
declare function filterEntityAncestors(entities: Record<string, any>): void;
declare function mergeCollectionPaths(guide: any, log?: any): string[];
declare function resolvePathList(guideEntity: GuideEntity, def: {
    paths: Record<string, any>;
}): PathDesc[];
declare function buildRelations(guideEntity: any, paths$: PathDesc[]): {
    ancestors: any[];
};
export { filterEntityAncestors, resolvePathList, buildRelations, entityTransform, mergeCollectionPaths, };
