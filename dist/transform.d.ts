type TransformCtx = {
    spec: any;
    guide: any;
    opts: any;
    util: any;
    defpath: string;
};
type TransformSpec = {
    transform: Transform[];
};
type TransformResult = {
    ok: boolean;
};
type Transform = (ctx: TransformCtx, tspec: TransformSpec, model: any, def: any) => Promise<TransformResult>;
type ProcessResult = {
    ok: boolean;
    results: TransformResult[];
};
declare function resolveTransforms(ctx: TransformCtx): Promise<TransformSpec>;
declare function processTransforms(ctx: TransformCtx, spec: TransformSpec, model: any, def: any): Promise<ProcessResult>;
declare function fixName(base: any, name: string, prop?: string): void;
export type { TransformCtx, TransformSpec, };
export { fixName, resolveTransforms, processTransforms, };
