import type { TransformCtx, TransformSpec } from '../transform';
declare function topTransform(ctx: TransformCtx, tspec: TransformSpec, model: any, def: any): Promise<{
    ok: boolean;
}>;
export { topTransform };
