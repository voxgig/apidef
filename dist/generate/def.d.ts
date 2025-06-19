import type { ApiDefOptions, ApiModel, Log, FsUtil } from '../types';
declare function generateDef(apimodel: ApiModel, modelPath: string, opts: ApiDefOptions, res: {
    fs: FsUtil;
    log: Log;
}): void;
export { generateDef };
