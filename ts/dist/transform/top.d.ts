import type { TransformResult } from '../transform';
declare const topTransform: (ctx: any) => Promise<TransformResult>;
declare function resolveSecurity(def: any): Record<string, string> | null;
declare function findAuthPrefix(text: unknown): string | null;
export { topTransform, resolveSecurity, findAuthPrefix, };
