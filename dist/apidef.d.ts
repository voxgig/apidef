import type { ApiDefOptions, ApiModel } from './types';
import { parse } from './parse';
import { fixName } from './transform';
declare function ApiDef(opts: ApiDefOptions): {
    generate: (spec: any) => Promise<{
        ok: boolean;
        name: string;
        apimodel: ApiModel;
        ctx: {
            fs: any;
            log: import("pino").default.Logger<string, boolean>;
            spec: any;
            opts: ApiDefOptions;
            util: {
                fixName: typeof fixName;
            };
            defpath: string;
            model: {
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
            apimodel: ApiModel;
            def: undefined;
            note: {};
        };
        jres: import("jostraca").JostracaResult;
    }>;
};
declare namespace ApiDef {
    var makeBuild: (opts: ApiDefOptions) => Promise<{
        (model: any, build: any, ctx: any): Promise<any>;
        step: string;
    }>;
}
export type { ApiDefOptions, };
export { ApiDef, parse, };
