import Pino from 'pino';
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
};
declare function ApiDef(opts?: ApiDefOptions): {
    watch: (spec: any) => Promise<void>;
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
    }>;
};
export type { ApiDefOptions, };
export { ApiDef, };
