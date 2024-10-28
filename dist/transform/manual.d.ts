import type { TransformCtx, TransformSpec } from '../transform';
declare function manualTransform(ctx: TransformCtx, tspec: TransformSpec, model: any, def: any): Promise<{
    ok: boolean;
    msg: string;
}>;
export { manualTransform };
