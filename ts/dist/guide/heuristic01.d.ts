import { ApiDefContext, Guide } from '../types';
declare function heuristic01(ctx: ApiDefContext): Promise<Guide>;
declare function pathResource(parts: string[], method: string): string | null;
type SharingRoute = {
    cmp: string;
    method: string;
    path: string;
    op: string;
};
declare function sharedRoutes(routes: SharingRoute[], records: string[]): string[];
declare function distinctRecord(share: any, item: any): boolean;
declare function isNameParam(param: string): boolean;
declare function entityParamNames(paths: Record<string, Record<string, string>>): Record<string, Record<string, string>>;
export { distinctRecord, heuristic01, pathResource, sharedRoutes, entityParamNames, isNameParam, };
