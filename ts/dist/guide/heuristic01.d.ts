import { ApiDefContext, Guide } from '../types';
import type { MethodDesc } from '../desc';
import type { PathMatch } from '../utility';
declare const VERSION_TAG_RE: RegExp;
declare const READ_VERBS: string[];
declare const LITERAL_LAST_SHAPES: string[];
declare function heuristic01(ctx: ApiDefContext): Promise<Guide>;
declare function componentReadOwner(pathStr: string, owner: Record<string, string>, routes: {
    path: string;
    method: string;
    cmp?: {
        ref?: string;
        cmp?: string;
    } | null;
}[]): {
    entname: string;
    method: string;
} | null;
declare function cleanCmp(data: {
    guide: any;
    work: any;
}, name: string): string;
declare function collectionOwner(mdesc: MethodDesc, parts: string[], work: any): string | null;
declare function warnListBody(ctx: any, where: string, res: any, props: any): void;
declare function genericCmp(name: string, refs: Record<string, number>): boolean;
declare function actionWord(part: string | undefined): string;
declare function keyRunBefore(parts: string[], isEnt: (part: string) => boolean): boolean;
declare function isVerbWord(part: string): boolean;
declare function keyedBy(next: string | undefined, name: string): boolean;
declare function pathNoun(pm: PathMatch, parts: string[], why: string[]): string;
declare function namedRecord(schema: any, last: string): boolean;
declare function verbAfterNoun(parts: string[], at: number, entname: string): boolean;
declare function relationshipOf(data: {
    def: any;
    work: any;
}, parts: string[], pathowner: Record<string, Record<string, string>>): {
    parent: string;
    action: string;
} | null;
declare function keyNounOf(data: {
    def: any;
    work: any;
}, mdesc: any, parts: string[]): {
    parent: string;
    action: string;
} | null;
declare function asyncResultOf(data: {
    def: any;
    guide: any;
    work: any;
}, mdesc: any, parts: string[]): {
    parent: string;
    action: string;
} | null;
declare function singletonOf(data: {
    def: any;
    work: any;
}, pathStr: string): string | null;
declare function subWriteOfItem(data: {
    def: any;
    work: any;
}, mdesc: any, parts: string[], pathowner: Record<string, Record<string, string>>): {
    parent: string;
    action: string;
} | null;
declare function itemAbove(data: {
    def: any;
    work: any;
}, parts: string[], key: number, pathowner: Record<string, Record<string, string>>): string | null;
declare function verbOfItem(data: {
    def: any;
    work: any;
}, mdesc: any, parts: string[], pathowner: Record<string, Record<string, string>>): {
    parent: string;
    action: string;
} | null;
declare function shortLiteral(pm: PathMatch): boolean;
declare function nounless(pm: PathMatch, parts: string[]): boolean;
declare function responsePayload(schema: any): {
    scalars: boolean;
    record: boolean;
    node: any;
};
declare function recordOf(data: {
    def: any;
    guide: any;
    work: any;
}, pathStr: string): {
    cmp: string;
    orig: string;
    shared: boolean;
} | null;
declare function variantOfCollection(data: {
    def: any;
    guide: any;
    work: any;
}, mdesc: any, parts: string[], pathowner: Record<string, Record<string, string>>): {
    parent: string;
    action: string;
} | null;
declare function pathQualified(parts: string[], cmp: string, lit: string): boolean;
declare function wrapsLiteral(cmp: string, lit: string): boolean;
declare function commandSource(data: {
    def: any;
    guide: any;
    work: any;
}, mdesc: any): {
    name: string;
    from: 'body' | 'opid';
} | null;
declare function readsRecord(data: {
    def: any;
}, pathStr: string): boolean;
declare function commandBodyName(data: {
    def: any;
    guide: any;
    work: any;
}, mdesc: any): string | null;
declare function commandTwin(data: {
    def: any;
    guide: any;
    work: any;
}, mdesc: any, pm: PathMatch, parts: string[], why: string[]): string | null;
declare function postReadVerb(mdesc: any, pm: PathMatch | null | undefined, parts: string[]): string | null;
declare function namingSchemas(method: string, responses: any, answered: Record<string, boolean>, envelope: Record<string, string>): any[];
declare function answeredRefs(def: any, envelope: Record<string, string>): Record<string, boolean>;
declare function listedRefs(def: any): Record<string, boolean>;
declare function namingRef(schema: any, envelope: Record<string, string>): string | undefined;
declare function pathRecordRef(def: any, pathStr: string, methods: string[], collection: boolean, accepted?: boolean): string | null;
declare function tagHolds(data: {
    def: any;
}, parts: string[], pathStr: string, tag: string): boolean;
declare function keyParamOf(def: any, pathStr: string, work: {
    childKeys?: Record<string, string>;
}): string | null;
declare function normalizeParams(pathStr: string): string;
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
declare function pathAnswersPage(pathdef: any, pathStr: string, pm: PathMatch | null, listed: Record<string, boolean>): boolean;
declare function pathAnswersRecordMap(pathdef: any): boolean;
declare function randomRoute(parts: string[]): boolean;
declare function selectorRoute(parts: string[], pathdef: any, entname: string): boolean;
declare function isListResponse(mdesc: Record<string, any>, pm: PathMatch | null | undefined, pathStr: string, why: string[], listed?: Record<string, boolean>): boolean;
declare function isVerb(partStr: string): boolean;
declare function verbParts(parts: string[]): string[];
declare function isNameParam(param: string): boolean;
declare function entityParamNames(paths: Record<string, Record<string, string>>): Record<string, Record<string, string>>;
declare function arrayBodyField(schema: any, entname: string, taken?: string[]): string;
export { answeredRefs, collectionOwner, listedRefs, pathAnswersPage, pathAnswersRecordMap, randomRoute, selectorRoute, namedRecord, verbAfterNoun, warnListBody, arrayBodyField, commandBodyName, commandTwin, itemAbove, pathQualified, readsRecord, recordOf, responsePayload, tagHolds, wrapsLiteral, isListResponse, LITERAL_LAST_SHAPES, READ_VERBS, distinctRecord, distinctShare, heuristic01, keyParamOf, matchEntityPath, pathNoun, namingRef, namingSchemas, pathRecordRef, pathResource, sharedRoutes, entityParamNames, isNameParam, isVerb, verbParts, verbOfItem, shortLiteral, normalizeParams, cleanCmp, commandSource, relationshipOf, singletonOf, subWriteOfItem, variantOfCollection, keyNounOf, asyncResultOf, nounless, genericCmp, actionWord, keyRunBefore, VERSION_TAG_RE, isVerbWord, keyedBy, postReadVerb, componentReadOwner, };
