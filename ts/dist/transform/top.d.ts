import type { TransformResult } from '../transform';
declare const topTransform: (ctx: any) => Promise<TransformResult>;
declare function resolveSummary(def: any): string | undefined;
declare function resolveWebsite(def: any, servers: any[]): string | undefined;
declare function homepageFromServer(url: any): string | undefined;
declare function resolveSecurity(def: any): Record<string, string> | null;
declare function findAuthPrefix(text: unknown): string | null;
export { topTransform, resolveSecurity, resolveSummary, resolveWebsite, homepageFromServer, findAuthPrefix, };
