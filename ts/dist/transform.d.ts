type TransformCtx = {
    log: any;
    spec: any;
    model: any;
    opts: any;
    util: any;
    defpath: string;
};
type TransformSpec = {
    transform: Transform[];
};
type TransformResult = {
    ok: boolean;
    msg: string;
    err?: any;
    transform?: any;
};
type Transform = (ctx: TransformCtx) => Promise<TransformResult>;
declare const OPKIND: any;
declare const GuideShape: {
    <V>(root?: V | undefined, ctx?: import("shape").Context): (0 extends 1 & V ? true : false) extends true ? {
        entity: {};
        control: {};
        transform: {};
        manual: {};
    } : V extends object ? Omit<V, "control" | "entity" | "manual" | "transform"> & {
        entity: {};
        control: {};
        transform: {};
        manual: {};
    } : {
        entity: {};
        control: {};
        transform: {};
        manual: {};
    };
    valid: <V>(root?: V | undefined, ctx?: import("shape").Context) => root is V & {
        entity: {};
        control: {};
        transform: {};
        manual: {};
    };
    match: (root?: any, ctx?: import("shape").Context) => boolean;
    error: (root?: any, ctx?: import("shape").Context) => import("shape").ErrDesc[];
    spec: () => any;
    node: () => import("shape").Node<{
        readonly entity: {};
        readonly control: {};
        readonly transform: {};
        readonly manual: {};
    }>;
    stringify: (...rest: any[]) => string;
    jsonify: () => any;
    jsonSchema: () => any;
    json: () => any;
    toString: (this: any) => string;
    shape: {
        shape$: symbol;
        v$: string;
    };
};
type Guide = ReturnType<typeof GuideShape>;
declare function fixName(base: any, name: string, prop?: string): void;
export type { TransformCtx, TransformSpec, Transform, TransformResult, Guide, };
export { fixName, OPKIND, GuideShape, };
