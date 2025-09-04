import type { Transform } from '../transform';
declare const entityTransform: Transform;
type PathListItem = {
    orig: string;
    parts: string[];
    rename: Record<string, any>;
    op: Record<string, any>;
};
declare function resolvePathList(guideEntity: any): PathListItem[];
declare function buildRelations(guideEntity: any, pathlist$: PathListItem[]): {
    ancestors: any[];
};
export { resolvePathList, buildRelations, entityTransform, };
