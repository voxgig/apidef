declare function parse(kind: string, source: any, meta: {
    file: string;
}): Promise<any>;
declare function normalizePathKeys(keys: string[]): string[];
declare function decycledChild(holder: any, key: string | number): any;
export { parse, decycledChild, normalizePathKeys, colonPathKeys, };
declare function colonPathKeys(paths: Record<string, any>): string[];
