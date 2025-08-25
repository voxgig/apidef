import type { FsUtil, Log } from './types';
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
declare function pathMatch(path: string | string[], expr: string): null | (string[] & {
    index: number;
    expr: string;
});
export { getdlog, loadFile, formatJsonSrc, depluralize, find, capture, pathMatch, };
