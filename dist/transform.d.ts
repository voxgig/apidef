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
type Transform = (ctx: TransformCtx, guide: Guide, tspec: TransformSpec, apimodel: any, def: any) => Promise<TransformResult>;
type ProcessResult = {
    ok: boolean;
    msg: string;
    results: TransformResult[];
};
declare const OPKIND: any;
declare const GuideShape: {
    <V>(root?: V | undefined, ctx?: import("gubu").Context): V & {
        entity: {};
        control: {};
        transform: {};
    };
    valid: <V>(root?: V | undefined, ctx?: import("gubu").Context) => root is V & {
        entity: {};
        control: {};
        transform: {};
    };
    match(root?: any, ctx?: import("gubu").Context): boolean;
    error(root?: any, ctx?: import("gubu").Context): {
        gubu: boolean;
        code: string;
        gname: string;
        props: ({
            path: string;
            type: string;
            value: any;
        }[]);
        desc: () => ({
            name: string;
            code: string;
            err: {
                key: string;
                type: string;
                node: import("gubu").Node<any>;
                value: any;
                path: string;
                why: string;
                check: string;
                args: Record<string, any>;
                mark: number;
                text: string;
                use: any;
            }[];
            ctx: any;
        });
        toJSON(): /*elided*/ any & {
            err: any;
            name: string;
            message: string;
        };
        name: string;
        message: string;
        stack?: string;
    }[];
    spec(): any;
    node(): import("gubu").Node<{
        entity: {};
        control: {};
        transform: {};
    }>;
    stringify(...rest: any[]): string;
    jsonify(): any;
    toString(this: any): string;
    gubu: {
        gubu$: symbol;
        v$: string;
    };
};
type Guide = ReturnType<typeof GuideShape>;
declare function resolveTransforms(ctx: TransformCtx): Promise<TransformSpec>;
declare function processTransforms(ctx: TransformCtx, spec: TransformSpec, apimodel: any, def: any): Promise<ProcessResult>;
declare function fixName(base: any, name: string, prop?: string): void;
export type { TransformCtx, TransformSpec, Transform, TransformResult, Guide, };
export { fixName, OPKIND, GuideShape, resolveTransforms, processTransforms, };
