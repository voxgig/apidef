import { ApiDefContext } from '../types';
declare function migrateLegacyGuide(fs: any, folder: string, guideprefix: string): boolean;
declare function migrateGuideIncludePrefix(fs: any, guidepath: string, guideprefix: string): boolean;
declare function buildGuide(ctx: ApiDefContext): Promise<any>;
export { migrateLegacyGuide, migrateGuideIncludePrefix, buildGuide };
