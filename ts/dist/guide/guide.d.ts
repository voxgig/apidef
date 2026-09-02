import { ApiDefContext } from '../types';
declare function migrateLegacyGuide(fs: any, folder: string, guideprefix: string): boolean;
declare function buildGuide(ctx: ApiDefContext): Promise<any>;
export { migrateLegacyGuide, buildGuide };
