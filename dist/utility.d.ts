import type { FsUtil, Log } from './types';
declare function loadFile(path: string, what: string, fs: FsUtil, log: Log): string;
declare function formatJsonSrc(jsonsrc: string): string;
export { loadFile, formatJsonSrc };
