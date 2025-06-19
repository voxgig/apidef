import type { FsUtil, Log } from './types';
declare function writeChanged(point: string, path: string, content: string, fs: FsUtil, log: Log, flags?: {
    update?: boolean;
}): void;
export { writeChanged };
