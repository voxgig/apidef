import type { TransformCtx, TransformSpec } from '../transform';
declare function fieldTransform(ctx: TransformCtx, tspec: TransformSpec, model: any, def: any): Promise<{
    ok: boolean;
}>;
export { fieldTransform };
