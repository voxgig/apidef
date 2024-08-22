type ApiDefOptions = {
    fs?: any;
};
declare function ApiDef(opts?: ApiDefOptions): {
    watch: (spec: any) => Promise<void>;
    generate: (spec: any) => Promise<{
        ok: boolean;
        model: {
            main: {
                api: {
                    entity: {};
                };
            };
        };
    }>;
};
export type { ApiDefOptions, };
export { ApiDef, };
