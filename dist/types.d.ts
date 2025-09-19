import * as Fs from 'node:fs';
import { Pino, prettyPino } from '@voxgig/util';
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
    why?: {
        show?: boolean;
    };
};
declare const ControlShape: {
    <V>(root?: V | undefined, ctx?: import("gubu").Context): V & {
        step: {
            parse: boolean;
            guide: boolean;
            transformers: boolean;
            builders: boolean;
            generate: boolean;
        };
    };
    valid: <V>(root?: V | undefined, ctx?: import("gubu").Context) => root is V & {
        step: {
            parse: boolean;
            guide: boolean;
            transformers: boolean;
            builders: boolean;
            generate: boolean;
        };
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
        step: {
            parse: boolean;
            guide: boolean;
            transformers: boolean;
            builders: boolean;
            generate: boolean;
        };
    }>;
    stringify(...rest: any[]): string;
    jsonify(): any;
    toString(this: any): string;
    gubu: {
        gubu$: symbol;
        v$: string;
    };
};
declare const OpenControlShape: {
    <V>(root?: V | undefined, ctx?: import("gubu").Context): V & {
        valid: {};
        match: {};
        error: {};
        spec: {};
        node: {};
        stringify: {};
        jsonify: {};
        toString: {};
        gubu: {
            gubu$: symbol;
            v$: string;
        };
    };
    valid: <V>(root?: V | undefined, ctx?: import("gubu").Context) => root is V & {
        <V_1>(root?: V_1 | undefined, ctx?: import("gubu").Context): V_1 & {
            step: {
                parse: boolean;
                guide: boolean;
                transformers: boolean;
                builders: boolean;
                generate: boolean;
            };
        };
        valid: <V_1>(root?: V_1 | undefined, ctx?: import("gubu").Context) => root is V_1 & {
            step: {
                parse: boolean;
                guide: boolean;
                transformers: boolean;
                builders: boolean;
                generate: boolean;
            };
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
            step: {
                parse: boolean;
                guide: boolean;
                transformers: boolean;
                builders: boolean;
                generate: boolean;
            };
        }>;
        stringify(...rest: any[]): string;
        jsonify(): any;
        toString(this: any): string;
        gubu: {
            gubu$: symbol;
            v$: string;
        };
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
        <V>(root?: V | undefined, ctx?: import("gubu").Context): V & {
            step: {
                parse: boolean;
                guide: boolean;
                transformers: boolean;
                builders: boolean;
                generate: boolean;
            };
        };
        valid: <V>(root?: V | undefined, ctx?: import("gubu").Context) => root is V & {
            step: {
                parse: boolean;
                guide: boolean;
                transformers: boolean;
                builders: boolean;
                generate: boolean;
            };
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
            step: {
                parse: boolean;
                guide: boolean;
                transformers: boolean;
                builders: boolean;
                generate: boolean;
            };
        }>;
        stringify(...rest: any[]): string;
        jsonify(): any;
        toString(this: any): string;
        gubu: {
            gubu$: symbol;
            v$: string;
        };
    }>;
    stringify(...rest: any[]): string;
    jsonify(): any;
    toString(this: any): string;
    gubu: {
        gubu$: symbol;
        v$: string;
    };
};
type Control = ReturnType<typeof ControlShape>;
declare const ModelShape: {
    <V>(root?: V | undefined, ctx?: import("gubu").Context): V & {
        name: string;
        def: string;
        main: {
            sdk: {};
            def: {};
            api: {
                guide: {};
                entity: {};
            };
        };
    };
    valid: <V>(root?: V | undefined, ctx?: import("gubu").Context) => root is V & {
        name: StringConstructor;
        def: StringConstructor;
        main: {
            sdk: {};
            def: {};
            api: {
                guide: {};
                entity: {};
            };
        };
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
        name: StringConstructor;
        def: StringConstructor;
        main: {
            sdk: {};
            def: {};
            api: {
                guide: {};
                entity: {};
            };
        };
    }>;
    stringify(...rest: any[]): string;
    jsonify(): any;
    toString(this: any): string;
    gubu: {
        gubu$: symbol;
        v$: string;
    };
};
declare const OpenModelShape: {
    <V>(root?: V | undefined, ctx?: import("gubu").Context): V & {
        valid: {};
        match: {};
        error: {};
        spec: {};
        node: {};
        stringify: {};
        jsonify: {};
        toString: {};
        gubu: {
            gubu$: symbol;
            v$: string;
        };
    };
    valid: <V>(root?: V | undefined, ctx?: import("gubu").Context) => root is V & {
        <V_1>(root?: V_1 | undefined, ctx?: import("gubu").Context): V_1 & {
            name: string;
            def: string;
            main: {
                sdk: {};
                def: {};
                api: {
                    guide: {};
                    entity: {};
                };
            };
        };
        valid: <V_1>(root?: V_1 | undefined, ctx?: import("gubu").Context) => root is V_1 & {
            name: StringConstructor;
            def: StringConstructor;
            main: {
                sdk: {};
                def: {};
                api: {
                    guide: {};
                    entity: {};
                };
            };
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
            name: StringConstructor;
            def: StringConstructor;
            main: {
                sdk: {};
                def: {};
                api: {
                    guide: {};
                    entity: {};
                };
            };
        }>;
        stringify(...rest: any[]): string;
        jsonify(): any;
        toString(this: any): string;
        gubu: {
            gubu$: symbol;
            v$: string;
        };
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
        <V>(root?: V | undefined, ctx?: import("gubu").Context): V & {
            name: string;
            def: string;
            main: {
                sdk: {};
                def: {};
                api: {
                    guide: {};
                    entity: {};
                };
            };
        };
        valid: <V>(root?: V | undefined, ctx?: import("gubu").Context) => root is V & {
            name: StringConstructor;
            def: StringConstructor;
            main: {
                sdk: {};
                def: {};
                api: {
                    guide: {};
                    entity: {};
                };
            };
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
            name: StringConstructor;
            def: StringConstructor;
            main: {
                sdk: {};
                def: {};
                api: {
                    guide: {};
                    entity: {};
                };
            };
        }>;
        stringify(...rest: any[]): string;
        jsonify(): any;
        toString(this: any): string;
        gubu: {
            gubu$: symbol;
            v$: string;
        };
    }>;
    stringify(...rest: any[]): string;
    jsonify(): any;
    toString(this: any): string;
    gubu: {
        gubu$: symbol;
        v$: string;
    };
};
type Model = ReturnType<typeof ModelShape>;
declare const BuildShape: {
    <V>(root?: V | undefined, ctx?: import("gubu").Context): V & {
        spec: {
            base: string;
            path: string;
            debug: string;
            use: {};
            res: never[];
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
    valid: <V>(root?: V | undefined, ctx?: import("gubu").Context) => root is V & {
        spec: {
            base: string;
            path: string;
            debug: string;
            use: {};
            res: never[];
            require: string;
            log: {};
            fs: import("gubu").Node<unknown>;
            dryrun: boolean;
            buildargs: {};
            watch: {
                mod: boolean;
                add: boolean;
                rem: boolean;
            };
        };
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
        spec: {
            base: string;
            path: string;
            debug: string;
            use: {};
            res: never[];
            require: string;
            log: {};
            fs: import("gubu").Node<unknown>;
            dryrun: boolean;
            buildargs: {};
            watch: {
                mod: boolean;
                add: boolean;
                rem: boolean;
            };
        };
    }>;
    stringify(...rest: any[]): string;
    jsonify(): any;
    toString(this: any): string;
    gubu: {
        gubu$: symbol;
        v$: string;
    };
};
declare const OpenBuildShape: {
    <V>(root?: V | undefined, ctx?: import("gubu").Context): V & {
        valid: {};
        match: {};
        error: {};
        spec: {};
        node: {};
        stringify: {};
        jsonify: {};
        toString: {};
        gubu: {
            gubu$: symbol;
            v$: string;
        };
    };
    valid: <V>(root?: V | undefined, ctx?: import("gubu").Context) => root is V & {
        <V_1>(root?: V_1 | undefined, ctx?: import("gubu").Context): V_1 & {
            spec: {
                base: string;
                path: string;
                debug: string;
                use: {};
                res: never[];
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
        valid: <V_1>(root?: V_1 | undefined, ctx?: import("gubu").Context) => root is V_1 & {
            spec: {
                base: string;
                path: string;
                debug: string;
                use: {};
                res: never[];
                require: string;
                log: {};
                fs: import("gubu").Node<unknown>;
                dryrun: boolean;
                buildargs: {};
                watch: {
                    mod: boolean;
                    add: boolean;
                    rem: boolean;
                };
            };
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
            spec: {
                base: string;
                path: string;
                debug: string;
                use: {};
                res: never[];
                require: string;
                log: {};
                fs: import("gubu").Node<unknown>;
                dryrun: boolean;
                buildargs: {};
                watch: {
                    mod: boolean;
                    add: boolean;
                    rem: boolean;
                };
            };
        }>;
        stringify(...rest: any[]): string;
        jsonify(): any;
        toString(this: any): string;
        gubu: {
            gubu$: symbol;
            v$: string;
        };
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
        <V>(root?: V | undefined, ctx?: import("gubu").Context): V & {
            spec: {
                base: string;
                path: string;
                debug: string;
                use: {};
                res: never[];
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
        valid: <V>(root?: V | undefined, ctx?: import("gubu").Context) => root is V & {
            spec: {
                base: string;
                path: string;
                debug: string;
                use: {};
                res: never[];
                require: string;
                log: {};
                fs: import("gubu").Node<unknown>;
                dryrun: boolean;
                buildargs: {};
                watch: {
                    mod: boolean;
                    add: boolean;
                    rem: boolean;
                };
            };
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
            spec: {
                base: string;
                path: string;
                debug: string;
                use: {};
                res: never[];
                require: string;
                log: {};
                fs: import("gubu").Node<unknown>;
                dryrun: boolean;
                buildargs: {};
                watch: {
                    mod: boolean;
                    add: boolean;
                    rem: boolean;
                };
            };
        }>;
        stringify(...rest: any[]): string;
        jsonify(): any;
        toString(this: any): string;
        gubu: {
            gubu$: symbol;
            v$: string;
        };
    }>;
    stringify(...rest: any[]): string;
    jsonify(): any;
    toString(this: any): string;
    gubu: {
        gubu$: symbol;
        v$: string;
    };
};
type Build = ReturnType<typeof BuildShape>;
type ApiModel = {
    main: {
        api: Record<string, any>;
        sdk: {
            info: Record<string, any>;
            entity: Record<string, any>;
            flow: Record<string, any>;
        };
        def: Record<string, any>;
    };
};
type ApiDefResult = {
    ok: boolean;
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
        entity: number;
    };
    found: {
        cmp: Record<string, any>;
    };
};
type ApiDefContext = {
    fs: any;
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
type CmpDesc = {
    namedesc?: CmpNameDesc;
    path_rate: number;
    method_rate: number;
};
type MethodName = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS' | '';
type MethodDesc = {
    name: MethodName;
    def: Record<string, any>;
    path: string;
};
type CmpNameDesc = {
    cmp: string;
    origcmp: string;
};
export { OpenControlShape, OpenModelShape, OpenBuildShape, };
export type { CmpDesc, CmpNameDesc, MethodName, MethodDesc, TypeName, Log, FsUtil, ApiDefOptions, ApiDefResult, Control, Model, Build, ApiModel, ApiDefContext, Warner, Metrics, };
