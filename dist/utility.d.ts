import type { FsUtil, Log, Warner } from './types';
declare function makeWarner(spec: {
    point: string;
    log: Log;
}): Warner;
declare function writeFileSyncWarn(warn: Warner, fs: any, path: string, text: string): void;
declare function getdlog(tagin?: string, filepath?: string): ((...args: any[]) => void) & {
    tag: string;
    file: string;
    log: (fp?: string) => any[];
};
declare function loadFile(path: string, what: string, fs: FsUtil, log: Log): string;
declare function formatJsonSrc(jsonsrc: string): string;
declare function depluralize(word: string): string;
declare function find(obj: any, qkey: string): any[];
declare function capture(data: any, shape: any): Record<string, any>;
type PathMatch = (string[] & {
    index: number;
    expr: string;
    path: string;
});
declare function pathMatch(path: string | string[], expr: string): null | PathMatch;
declare function formatJSONIC(val?: any, opts?: {
    hsepd?: number;
    $?: boolean;
    color?: boolean;
    maxlines?: number;
    exclude?: string[];
}): string;
declare function validator(torig: undefined | string | string[]): any;
declare function canonize(s: string): string;
declare function warnOnError(where: string, warn: Warner, fn: Function, result?: any): any;
declare function debugpath(pathStr: string, methodName: string | null | undefined, ...args: any[]): void;
declare function findPathsWithPrefix(ctx: any, pathStr: string, opts?: {
    strict?: boolean;
    param?: boolean;
}): number;
declare function nom(v: any, format: string): string;
declare function relativizePath(path: string): string;
declare function getModelPath(model: any, path: string, flags?: {
    required?: boolean;
    only_active?: boolean;
}): any;
export type { PathMatch };
export { nom, getdlog, loadFile, formatJsonSrc, depluralize, find, capture, pathMatch, makeWarner, formatJSONIC, validator, canonize, debugpath, findPathsWithPrefix, writeFileSyncWarn, warnOnError, relativizePath, getModelPath, };
