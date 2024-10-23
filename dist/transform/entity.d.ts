import type { TransformCtx, TransformSpec } from '../transform';
declare function entityTransform(ctx: TransformCtx, tspec: TransformSpec, model: any, def: any): Promise<{
    ok: boolean;
}>;
export { entityTransform };
