import * as Fs from 'node:fs';
import { Pino, prettyPino } from '@voxgig/util';
type FsUtil = typeof Fs;
type Log = ReturnType<typeof prettyPino>;
type ApiDefOptions = {
    def?: string;
    fs?: any;
    pino?: ReturnType<typeof Pino>;
    debug?: boolean | string;
    folder?: string;
    meta?: Record<string, any>;
    outprefix?: string;
    strategy?: string;
};
declare const ModelShape: {
    <V>(root?: V | undefined, ctx?: import("gubu").Context): V & {
        def: string;
        main: {
            sdk: {};
            def: {};
            api: {
                guide: {};
            };
        };
    };
    valid: <V>(root?: V | undefined, ctx?: import("gubu").Context) => root is V & {
        def: StringConstructor;
        main: {
            sdk: {};
            def: {};
            api: {
                guide: {};
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
        def: StringConstructor;
        main: {
            sdk: {};
            def: {};
            api: {
                guide: {};
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
            def: string;
            main: {
                sdk: {};
                def: {};
                api: {
                    guide: {};
                };
            };
        };
        valid: <V_1>(root?: V_1 | undefined, ctx?: import("gubu").Context) => root is V_1 & {
            def: StringConstructor;
            main: {
                sdk: {};
                def: {};
                api: {
                    guide: {};
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
            def: StringConstructor;
            main: {
                sdk: {};
                def: {};
                api: {
                    guide: {};
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
            def: string;
            main: {
                sdk: {};
                def: {};
                api: {
                    guide: {};
                };
            };
        };
        valid: <V>(root?: V | undefined, ctx?: import("gubu").Context) => root is V & {
            def: StringConstructor;
            main: {
                sdk: {};
                def: {};
                api: {
                    guide: {};
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
            def: StringConstructor;
            main: {
                sdk: {};
                def: {};
                api: {
                    guide: {};
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
        api: {
            entity: Record<string, any>;
        };
        def: Record<string, any>;
    };
};
export { OpenModelShape, OpenBuildShape, };
export type { Log, FsUtil, ApiDefOptions, Model, Build, ApiModel, };
