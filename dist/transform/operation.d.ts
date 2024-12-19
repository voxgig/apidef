import type { TransformCtx, TransformSpec, TransformResult, Guide } from '../transform';
declare const operationTransform: (ctx: TransformCtx, guide: Guide, tspec: TransformSpec, model: any, def: any) => Promise<TransformResult>;
export { operationTransform };
