declare function parse(kind: string, source: any, meta: {
    file: string;
}): Promise<any>;
declare function decycledChild(holder: any, key: string | number): any;
export { parse, decycledChild, };
