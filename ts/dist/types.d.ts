import * as Fs from 'node:fs';
import { Pino, prettyPino } from '@voxgig/util';
declare const KIT = "kit";
type FsUtil = typeof Fs;
type Log = ReturnType<typeof prettyPino>;
type TypeName = 'String' | 'Number' | 'Integer' | 'Boolean' | 'Null' | 'Array' | 'Object' | 'Any';
type ApiDefOptions = {
    def?: string;
    fs?: any;
    pino?: ReturnType<typeof Pino>;
    debug?: boolean | string;
    folder?: string;
    meta?: Record<string, any>;
    outprefix?: string;
    strategy?: string;
    kind?: DefKind;
    endpoint?: string;
    auth?: ApiDefAuthOption;
    why?: {
        show?: boolean;
    };
};
type DefKind = 'OpenAPI' | 'GraphQL';
type ApiDefAuthOption = {
    active?: boolean;
    scheme?: string;
    type?: string;
    in?: string;
    name?: string;
    prefix?: string;
};
declare const ControlShape: {
    <V>(root?: V | undefined, ctx?: import("shape").Context): (0 extends 1 & V ? true : false) extends true ? {
        step: {
            parse: boolean;
            guide: boolean;
            transformers: boolean;
            builders: boolean;
            generate: boolean;
        };
    } : V extends object ? Omit<V, "step"> & {
        step: {
            parse: boolean;
            guide: boolean;
            transformers: boolean;
            builders: boolean;
            generate: boolean;
        };
    } : {
        step: {
            parse: boolean;
            guide: boolean;
            transformers: boolean;
            builders: boolean;
            generate: boolean;
        };
    };
    valid: <V>(root?: V | undefined, ctx?: import("shape").Context) => root is V & {
        step: {
            parse: boolean;
            guide: boolean;
            transformers: boolean;
            builders: boolean;
            generate: boolean;
        };
    };
    match: (root?: any, ctx?: import("shape").Context) => boolean;
    error: (root?: any, ctx?: import("shape").Context) => import("shape").ErrDesc[];
    spec: () => any;
    node: () => import("shape").Node<{
        readonly step: {
            readonly parse: true;
            readonly guide: true;
            readonly transformers: true;
            readonly builders: true;
            readonly generate: true;
        };
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
declare const OpenControlShape: {
    <V>(root?: V | undefined, ctx?: import("shape").Context): (0 extends 1 & V ? true : false) extends true ? {
        step: {
            parse: boolean;
            guide: boolean;
            transformers: boolean;
            builders: boolean;
            generate: boolean;
        };
    } : V extends object ? Omit<V, "step"> & {
        step: {
            parse: boolean;
            guide: boolean;
            transformers: boolean;
            builders: boolean;
            generate: boolean;
        };
    } : {
        step: {
            parse: boolean;
            guide: boolean;
            transformers: boolean;
            builders: boolean;
            generate: boolean;
        };
    };
    valid: <V>(root?: V | undefined, ctx?: import("shape").Context) => root is V & {
        step: {
            parse: boolean;
            guide: boolean;
            transformers: boolean;
            builders: boolean;
            generate: boolean;
        };
    };
    match: (root?: any, ctx?: import("shape").Context) => boolean;
    error: (root?: any, ctx?: import("shape").Context) => import("shape").ErrDesc[];
    spec: () => any;
    node: () => import("shape").Node<import("shape").Node<{
        readonly step: {
            readonly parse: true;
            readonly guide: true;
            readonly transformers: true;
            readonly builders: true;
            readonly generate: true;
        };
    }>>;
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
type Control = ReturnType<typeof ControlShape>;
declare const ModelShape: {
    <V>(root?: V | undefined, ctx?: import("shape").Context): (0 extends 1 & V ? true : false) extends true ? {
        name: string;
        def: string;
        main: {
            kit: {};
            def: {};
            api: {
                guide: {};
                entity: {};
            };
            custom: {
                plurals: {};
            };
        };
    } : V extends object ? Omit<V, "def" | "main" | "name"> & {
        name: string;
        def: string;
        main: {
            kit: {};
            def: {};
            api: {
                guide: {};
                entity: {};
            };
            custom: {
                plurals: {};
            };
        };
    } : {
        name: string;
        def: string;
        main: {
            kit: {};
            def: {};
            api: {
                guide: {};
                entity: {};
            };
            custom: {
                plurals: {};
            };
        };
    };
    valid: <V>(root?: V | undefined, ctx?: import("shape").Context) => root is V & {
        name: string;
        def: string;
        main: {
            kit: {};
            def: {};
            api: {
                guide: {};
                entity: {};
            };
            custom: {
                plurals: {};
            };
        };
    };
    match: (root?: any, ctx?: import("shape").Context) => boolean;
    error: (root?: any, ctx?: import("shape").Context) => import("shape").ErrDesc[];
    spec: () => any;
    node: () => import("shape").Node<{
        readonly name: StringConstructor;
        readonly def: StringConstructor;
        readonly main: {
            readonly kit: {};
            readonly def: {};
            readonly api: {
                guide: {};
                entity: {};
            };
            readonly custom: {
                plurals: {};
            };
        };
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
declare const OpenModelShape: {
    <V>(root?: V | undefined, ctx?: import("shape").Context): (0 extends 1 & V ? true : false) extends true ? {
        name: string;
        def: string;
        main: {
            kit: {};
            def: {};
            api: {
                guide: {};
                entity: {};
            };
            custom: {
                plurals: {};
            };
        };
    } : V extends object ? Omit<V, "def" | "main" | "name"> & {
        name: string;
        def: string;
        main: {
            kit: {};
            def: {};
            api: {
                guide: {};
                entity: {};
            };
            custom: {
                plurals: {};
            };
        };
    } : {
        name: string;
        def: string;
        main: {
            kit: {};
            def: {};
            api: {
                guide: {};
                entity: {};
            };
            custom: {
                plurals: {};
            };
        };
    };
    valid: <V>(root?: V | undefined, ctx?: import("shape").Context) => root is V & {
        name: string;
        def: string;
        main: {
            kit: {};
            def: {};
            api: {
                guide: {};
                entity: {};
            };
            custom: {
                plurals: {};
            };
        };
    };
    match: (root?: any, ctx?: import("shape").Context) => boolean;
    error: (root?: any, ctx?: import("shape").Context) => import("shape").ErrDesc[];
    spec: () => any;
    node: () => import("shape").Node<import("shape").Node<{
        readonly name: StringConstructor;
        readonly def: StringConstructor;
        readonly main: {
            readonly kit: {};
            readonly def: {};
            readonly api: {
                guide: {};
                entity: {};
            };
            readonly custom: {
                plurals: {};
            };
        };
    }>>;
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
type Model = ReturnType<typeof ModelShape>;
declare const BuildShape: {
    <V>(root?: V | undefined, ctx?: import("shape").Context): (0 extends 1 & V ? true : false) extends true ? {
        spec: {
            base: string;
            path: string;
            debug: string;
            use: {};
            res: any[];
            require: string;
            log: {};
            fs: any;
            dryrun: boolean;
            buildargs: {};
            watch: {
                mod: boolean;
                add: boolean;
                rem: boolean;
            };
        };
    } : V extends object ? Omit<V, "spec"> & {
        spec: {
            base: string;
            path: string;
            debug: string;
            use: {};
            res: any[];
            require: string;
            log: {};
            fs: any;
            dryrun: boolean;
            buildargs: {};
            watch: {
                mod: boolean;
                add: boolean;
                rem: boolean;
            };
        };
    } : {
        spec: {
            base: string;
            path: string;
            debug: string;
            use: {};
            res: any[];
            require: string;
            log: {};
            fs: any;
            dryrun: boolean;
            buildargs: {};
            watch: {
                mod: boolean;
                add: boolean;
                rem: boolean;
            };
        };
    };
    valid: <V>(root?: V | undefined, ctx?: import("shape").Context) => root is V & {
        spec: {
            base: string;
            path: string;
            debug: string;
            use: {};
            res: any[];
            require: string;
            log: {};
            fs: any;
            dryrun: boolean;
            buildargs: {};
            watch: {
                mod: boolean;
                add: boolean;
                rem: boolean;
            };
        };
    };
    match: (root?: any, ctx?: import("shape").Context) => boolean;
    error: (root?: any, ctx?: import("shape").Context) => import("shape").ErrDesc[];
    spec: () => any;
    node: () => import("shape").Node<{
        readonly spec: {
            readonly base: "";
            readonly path: "";
            readonly debug: "";
            readonly use: {};
            readonly res: readonly [];
            readonly require: "";
            readonly log: {};
            readonly fs: import("shape").Node<any>;
            readonly dryrun: false;
            readonly buildargs: {};
            readonly watch: {
                readonly mod: true;
                readonly add: true;
                readonly rem: true;
            };
        };
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
declare const OpenBuildShape: {
    <V>(root?: V | undefined, ctx?: import("shape").Context): (0 extends 1 & V ? true : false) extends true ? {
        spec: {
            base: string;
            path: string;
            debug: string;
            use: {};
            res: any[];
            require: string;
            log: {};
            fs: any;
            dryrun: boolean;
            buildargs: {};
            watch: {
                mod: boolean;
                add: boolean;
                rem: boolean;
            };
        };
    } : V extends object ? Omit<V, "spec"> & {
        spec: {
            base: string;
            path: string;
            debug: string;
            use: {};
            res: any[];
            require: string;
            log: {};
            fs: any;
            dryrun: boolean;
            buildargs: {};
            watch: {
                mod: boolean;
                add: boolean;
                rem: boolean;
            };
        };
    } : {
        spec: {
            base: string;
            path: string;
            debug: string;
            use: {};
            res: any[];
            require: string;
            log: {};
            fs: any;
            dryrun: boolean;
            buildargs: {};
            watch: {
                mod: boolean;
                add: boolean;
                rem: boolean;
            };
        };
    };
    valid: <V>(root?: V | undefined, ctx?: import("shape").Context) => root is V & {
        spec: {
            base: string;
            path: string;
            debug: string;
            use: {};
            res: any[];
            require: string;
            log: {};
            fs: any;
            dryrun: boolean;
            buildargs: {};
            watch: {
                mod: boolean;
                add: boolean;
                rem: boolean;
            };
        };
    };
    match: (root?: any, ctx?: import("shape").Context) => boolean;
    error: (root?: any, ctx?: import("shape").Context) => import("shape").ErrDesc[];
    spec: () => any;
    node: () => import("shape").Node<import("shape").Node<{
        readonly spec: {
            readonly base: "";
            readonly path: "";
            readonly debug: "";
            readonly use: {};
            readonly res: readonly [];
            readonly require: "";
            readonly log: {};
            readonly fs: import("shape").Node<any>;
            readonly dryrun: false;
            readonly buildargs: {};
            readonly watch: {
                readonly mod: true;
                readonly add: true;
                readonly rem: true;
            };
        };
    }>>;
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
type Build = ReturnType<typeof BuildShape>;
type ApiModel = {
    main: {
        kit: {
            info: Record<string, any>;
            entity: Record<string, any>;
            flow: Record<string, any>;
        };
    };
};
type KitModel = {
    info: Record<string, any>;
    entity: Record<string, any>;
    flow: Record<string, any>;
};
type ApiDefResult = {
    ok: boolean;
    reload?: boolean;
    start: number;
    end: number;
    steps: string[];
    err?: any;
    ctrl?: Control;
    guide?: any;
    apimodel?: any;
    ctx?: any;
    jres?: any;
};
type Metrics = {
    count: {
        path: number;
        method: number;
        origcmprefs: Record<string, number>;
        cmp: number;
        tag: number;
        entity: number;
    };
    found: {
        cmp: Record<string, any>;
        tag: Record<string, any>;
    };
};
type ApiDefContext = {
    fs: any;
    fsInjected: boolean;
    log: any;
    spec: any;
    opts: any;
    util: any;
    defpath: string;
    model: any;
    apimodel: any;
    guide: any;
    def: any;
    note: any;
    warn: any;
    metrics: Metrics;
    work: Record<string, any>;
};
type Warner = {
    history: ({
        point: string;
        when: number;
    } & Record<string, any>)[];
    point: string;
} & ((details: Record<string, any>) => void);
type MethodName = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS' | 'QUERY' | '';
type Guide = {
    metrics: GuideMetrics;
    entity: Record<string, GuideEntity>;
    control: GuideControl;
};
type GuideControl = {};
type GuideMetrics = {
    count: {
        path: number;
        field: number;
        method: number;
        entity: number;
        tag: number;
        cmp: number;
        origcmprefs: Record<string, number>;
    };
    found: {
        tag: Record<string, string>;
        cmp: Record<string, string>;
    };
};
type GuideEntity = {
    id?: {
        parts?: string[];
        sep?: string;
        composite?: boolean;
        from?: Record<string, string>;
    };
    name: string;
    orig: string;
    active?: boolean;
    why_inactive?: string;
    field?: Record<string, GuidePath>;
    path: Record<string, GuidePath>;
};
type GuidePath = {
    why_path: string[];
    action: Record<string, GuidePathAction>;
    rename: {
        param: Record<string, GuideRenameParam>;
    };
    op: Record<string, GuidePathOp>;
};
type GuidePathAction = {
    kind: string;
    why_action: string[];
};
type GuideRenameParam = {
    target: string;
    why_rename: string[];
};
type GuidePathOp = {
    live?: Record<string, any>;
    contract?: Record<string, any>;
    method: string;
    optype?: string;
    why_op: string[];
    transform: {
        req: any;
        res: any;
    };
};
export { KIT, OpenControlShape, OpenModelShape, OpenBuildShape, };
export type { Guide, GuideMetrics, GuideEntity, GuidePath, GuidePathAction, GuideRenameParam, GuidePathOp, KitModel, MethodName, TypeName, Log, FsUtil, ApiDefOptions, DefKind, ApiDefAuthOption, ApiDefResult, Control, Model, Build, ApiModel, ApiDefContext, Warner, Metrics, };
export type { CmpDesc, BasicMethodDesc, MethodDesc, MethodEntityDesc, EntityDesc, EntityPathDesc, PathDesc, OpDesc, } from './desc';
export type { OpName, ModelEntityRelations, ModelOpMap, ModelFieldOp, ModelField, ModelArg, ModelPoint, ModelOp, ModelEntity, } from './model';
