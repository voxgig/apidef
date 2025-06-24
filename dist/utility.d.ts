import type { FsUtil, Log } from './types';
declare function loadFile(path: string, what: string, fs: FsUtil, log: Log): string;
declare function writeChanged(point: string, path: string, content: string, fs: FsUtil, log: Log, flags?: {
    update?: boolean;
}): void;
export { loadFile, writeChanged, };
