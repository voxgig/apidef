declare function parse(kind: string, source: any, meta: {
    file: string;
}): Promise<any>;
export { parse, };
