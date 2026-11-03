import { ApiDefContext, Guide } from '../types';
import type { PathMatch } from '../utility';
declare const READ_VERBS: string[];
declare const LITERAL_LAST_SHAPES: string[];
declare function heuristic01(ctx: ApiDefContext): Promise<Guide>;
declare function pathNoun(pm: PathMatch, parts: string[], why: string[]): string;
declare function tagNamesLiteral(parts: string[], tag: string): boolean;
declare function responsePayload(schema: any): {
    scalars: boolean;
    record: boolean;
};
declare function readsRecord(data: {
    def: any;
}, pathStr: string): boolean;
declare function commandBodyName(data: {
    def: any;
    guide: any;
}, mdesc: any): string | null;
declare function namingSchemas(method: string, responses: any, answered: Record<string, boolean>, envelope: Record<string, string>): any[];
declare function answeredRefs(def: any, envelope: Record<string, string>): Record<string, boolean>;
declare function namingRef(schema: any, envelope: Record<string, string>): string | undefined;
declare function pathRecordRef(def: any, pathStr: string, methods: string[], collection: boolean, accepted?: boolean): string | null;
declare function keyParamOf(def: any, pathStr: string, work: {
    childKeys?: Record<string, string>;
}): string | null;
declare function matchEntityPath(parts: string[]): PathMatch | null;
declare function pathResource(parts: string[], method: string): string | null;
type SharingRoute = {
    cmp: string;
    method: string;
    path: string;
    op: string;
};
declare function sharedRoutes(routes: SharingRoute[], records: string[]): string[];
declare function distinctRecord(share: any, item: any): boolean;
declare function distinctShare(def: any, sharePath: string, shareMethods: string[], itemPath: string, itemMethods: string[]): boolean;
declare function isListResponse(mdesc: Record<string, any>, pm: PathMatch | null | undefined, pathStr: string, why: string[]): boolean;
declare function isVerb(partStr: string): boolean;
declare function verbParts(parts: string[]): string[];
declare function isNameParam(param: string): boolean;
declare function entityParamNames(paths: Record<string, Record<string, string>>): Record<string, Record<string, string>>;
declare function arrayBodyField(schema: any, entname: string, taken?: string[]): string;
export { answeredRefs, arrayBodyField, commandBodyName, readsRecord, responsePayload, isListResponse, LITERAL_LAST_SHAPES, READ_VERBS, distinctRecord, distinctShare, heuristic01, keyParamOf, matchEntityPath, pathNoun, tagNamesLiteral, namingRef, namingSchemas, pathRecordRef, pathResource, sharedRoutes, entityParamNames, isNameParam, isVerb, verbParts, };
