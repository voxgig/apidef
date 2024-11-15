import { Pino } from '@voxgig/util';
type ApiDefOptions = {
    fs?: any;
    pino?: ReturnType<typeof Pino>;
    debug?: boolean | string;
};
type ApiDefSpec = {
    def: string;
    model: string;
    kind: string;
    meta: Record<string, any>;
    guide: any;
};
declare function ApiDef(opts?: ApiDefOptions): {
    watch: (spec: ApiDefSpec) => Promise<void>;
    generate: (spec: ApiDefSpec) => Promise<{
        ok: boolean;
        model: {
            main: {
                api: {
                    entity: {};
                };
                def: {};
            };
        };
    } | undefined>;
};
export type { ApiDefOptions, ApiDefSpec, };
export { ApiDef, };
