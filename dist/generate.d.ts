import type { ApiDefOptions, Log, FsUtil } from './types';
declare function generateModel(apimodel: any, spec: any, opts: ApiDefOptions, res: {
    fs: FsUtil;
    log: Log;
}): void;
export { generateModel };
