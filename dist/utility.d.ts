import type { FsUtil, Log, Warner } from './types';
declare function makeWarner(spec: {
    point: string;
    log: Log;
}): Warner;
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
}): string;
declare function validator(torig: undefined | string | string[]): any;
declare function canonize(s: string): string;
declare function nom(v: any, format: string): string;
export type { PathMatch };
export { nom, getdlog, loadFile, formatJsonSrc, depluralize, find, capture, pathMatch, makeWarner, formatJSONIC, validator, canonize, };
