import type { FsUtil, Log } from './types';
declare function getdlog(tagin?: string, filepath?: string): ((...args: any[]) => void) & {
    tag: string;
    file: string;
    log: (fp?: string) => any[];
};
declare function loadFile(path: string, what: string, fs: FsUtil, log: Log): string;
declare function formatJsonSrc(jsonsrc: string): string;
declare function depluralize(word: string): string;
export { getdlog, loadFile, formatJsonSrc, depluralize, };
