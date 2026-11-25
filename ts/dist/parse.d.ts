declare function parse(kind: string, source: any, meta: {
    file: string;
}): Promise<any>;
declare const IGNORED_HEADERS_KEY = "x-apidef-ignored-headers";
declare const DUPLICATE_PARAMS_KEY = "x-apidef-duplicate-params";
declare function normalizePathKeys(keys: string[]): string[];
declare function decycledChild(holder: any, key: string | number): any;
export { parse, decycledChild, normalizePathKeys, colonPathKeys, IGNORED_HEADERS_KEY, DUPLICATE_PARAMS_KEY, };
declare function colonPathKeys(paths: Record<string, any>): string[];
