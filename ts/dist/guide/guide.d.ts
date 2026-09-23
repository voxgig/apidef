import { ApiDefContext } from '../types';
declare function migrateGuideIncludes(src: string, guideprefix: string): string;
declare function prefixGuideInclude(src: string, guideprefix: string): string;
declare function migrateLegacyGuide(fs: any, folder: string, guideprefix: string): boolean;
declare function migrateGuideIncludePrefix(fs: any, guidepath: string, guideprefix: string): boolean;
declare function guideConflictMessage(path: string, conflict: {
    line: number;
    text: string;
}): string;
declare function findConflict(src: string): {
    line: number;
    text: string;
} | null;
declare function buildGuide(ctx: ApiDefContext): Promise<any>;
declare function guideEntrySource(guideprefix: string): string[];
declare function baseGuideHeader(guideprefix: string): string[];
export { migrateGuideIncludes, prefixGuideInclude, findConflict, guideConflictMessage, baseGuideHeader, guideEntrySource, migrateLegacyGuide, migrateGuideIncludePrefix, buildGuide };
