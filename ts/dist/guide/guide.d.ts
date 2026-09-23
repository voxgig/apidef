import { ApiDefContext } from '../types';
declare function migrateGuideIncludes(src: string, guideprefix: string): string;
declare function prefixGuideInclude(src: string, guideprefix: string): string;
declare function migrateLegacyGuide(fs: any, folder: string, guideprefix: string): boolean;
declare function migrateGuideIncludePrefix(fs: any, guidepath: string, guideprefix: string): boolean;
declare function findConflict(src: string): {
    line: number;
    text: string;
} | null;
declare function buildGuide(ctx: ApiDefContext): Promise<any>;
export { migrateGuideIncludes, prefixGuideInclude, findConflict, migrateLegacyGuide, migrateGuideIncludePrefix, buildGuide };
