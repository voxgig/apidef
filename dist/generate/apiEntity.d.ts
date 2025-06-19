import type { ApiDefOptions, Log, FsUtil } from '../types';
declare function generateApiEntity(apimodel: any, spec: any, opts: ApiDefOptions, res: {
    fs: FsUtil;
    log: Log;
}): void;
export { generateApiEntity };
