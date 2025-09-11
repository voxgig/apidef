type JSONSchema = Record<string, any>;
type ConvertOptions = {
    /** Where to resolve $ref from. Use your OpenAPI doc’s components.schemas, or JSON Schema $defs. */
    refRoots?: Array<Record<string, JSONSchema>>;
    /** Optional: pass the entire root doc; only used if your $ref are absolute like #/components/schemas/X */
    rootDoc?: Record<string, any>;
};
export declare function convert(schema: JSONSchema | undefined, opts?: ConvertOptions): any;
export {};
