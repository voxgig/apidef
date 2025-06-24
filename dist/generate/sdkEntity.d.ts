import type { ApiDefOptions, ApiModel, Log, FsUtil } from '../types';
declare function generateSdkEntity(apimodel: ApiModel, opts: ApiDefOptions, res: {
    fs: FsUtil;
    log: Log;
}): void;
export { generateSdkEntity };
