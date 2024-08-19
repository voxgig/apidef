type ApiDefOptions = {
    fs: any;
};
declare function ApiDef(opts: ApiDefOptions): {
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
