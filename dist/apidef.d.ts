import type { ApiDefOptions, ApiDefResult } from './types';
import { parse } from './parse';
import { formatJSONIC } from './utility';
declare function ApiDef(opts: ApiDefOptions): {
    generate: (spec: any) => Promise<ApiDefResult>;
};
declare namespace ApiDef {
    var makeBuild: (opts: ApiDefOptions) => Promise<{
        (model: any, build: any, ctx: any): Promise<any>;
        step: string;
    }>;
}
export type { ApiDefOptions, };
export { ApiDef, parse, formatJSONIC, };
