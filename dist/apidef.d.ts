import type { ApiDefOptions, ApiModel } from './types';
import { parse } from './parse';
declare function ApiDef(opts: ApiDefOptions): {
    generate: (spec: any) => Promise<{
        ok: boolean;
        name: string;
        apimodel: ApiModel;
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
