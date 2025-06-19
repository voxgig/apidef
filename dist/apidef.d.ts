import type { ApiDefOptions, ApiModel } from './types';
import { parse } from './parse';
declare function ApiDef(opts: ApiDefOptions): {
    generate: (spec: any) => Promise<{
        ok: boolean;
        name: string;
        processResult: {
            ok: boolean;
            msg: string;
            results: import("./transform").TransformResult[];
        };
        apimodel?: undefined;
    } | {
        ok: boolean;
        name: string;
        apimodel: ApiModel;
        processResult?: undefined;
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
