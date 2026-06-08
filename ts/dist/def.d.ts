type PathDef = {
    summary?: string;
    description?: string;
    get?: MethodDef;
    put?: MethodDef;
    post?: MethodDef;
    delete?: MethodDef;
    options?: MethodDef;
    head?: MethodDef;
    patch?: MethodDef;
    trace?: MethodDef;
    servers?: ServerDef[];
    parameters?: ParameterDef[];
    tags?: any;
};
type MethodDef = {
    tags?: string[];
    summary?: string;
    description?: string;
    operationId?: string;
    parameters?: ParameterDef[];
    deprecated?: boolean;
    servers?: ServerDef[];
};
type ServerDef = {
    url: string;
    description?: string;
    variables?: Record<string, ServerVariableDef>;
};
type ServerVariableDef = {
    enum?: string[];
    default: string;
    description?: string;
};
type ParameterDef = {
    name: string;
    in: "query" | "header" | "path" | "cookie";
    description?: string;
    required?: boolean;
    deprecated?: boolean;
    schema?: SchemaDef;
    nullable?: boolean;
    example?: any;
};
type SchemaDef = {
    title?: string;
    description?: string;
    type?: string;
    format?: string;
    enum?: any[];
    items?: SchemaDef;
    properties?: Record<string, SchemaDef>;
    required?: string[];
    additionalProperties?: boolean | SchemaDef;
    allOf?: SchemaDef[];
    oneOf?: SchemaDef[];
    anyOf?: SchemaDef[];
    nullable?: boolean;
    default?: any;
    example?: any;
};
export type { PathDef, MethodDef, ServerDef, ServerVariableDef, ParameterDef, SchemaDef, };
