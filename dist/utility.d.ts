import type { FsUtil, Log } from './types';
declare function loadFile(path: string, what: string, fs: FsUtil, log: Log): string;
declare function formatJsonSrc(jsonsrc: string): string;
declare function depluralize(word: string): string;
export { loadFile, formatJsonSrc, depluralize, };
