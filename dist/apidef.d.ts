import { Pino } from '@voxgig/util';
type ApiDefOptions = {
    def: string;
    fs?: any;
    pino?: ReturnType<typeof Pino>;
    debug?: boolean | string;
    folder?: string;
    meta?: Record<string, any>;
};
declare function ApiDef(opts: ApiDefOptions): {
    generate: (spec: any) => Promise<{
        ok: boolean;
        processResult: {
            ok: boolean;
            msg: string;
            results: {
                ok: boolean;
                msg: string;
                err?: any;
                transform?: any;
            }[];
        };
        apimodel?: undefined;
    } | {
        ok: boolean;
        apimodel: {
            main: {
                api: {
                    entity: {};
                };
                def: {};
            };
        };
        processResult?: undefined;
    }>;
};
declare namespace ApiDef {
    var makeBuild: (opts: ApiDefOptions) => Promise<{
        (model: any, build: any, ctx: any): Promise<void>;
        step: string;
    }>;
}
export type { ApiDefOptions, };
export { ApiDef, };
