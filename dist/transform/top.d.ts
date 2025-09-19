import type { TransformResult } from '../transform';
import type { MethodName } from '../types';
type GuideEntity = {
    name: string;
    path: Record<string, GuidePath>;
    paths$: PathDesc[];
    opm$: Record<OpName, OpDesc>;
};
type GuidePath = {
    rename?: GuidePathRename;
    op?: Record<string, GuideOp>;
};
type GuidePathRename = {
    param?: Record<string, string>;
};
type GuideOp = {
    method: MethodName;
};
type ModelEntity = {
    name: string;
    op: ModelOpMap;
    fields: ModelField[];
    id: {
        name: string;
        field: string;
    };
    relations: ModelEntityRelations;
};
type ModelOpMap = Partial<Record<OpName, ModelOp | undefined>>;
type ModelEntityRelations = {
    ancestors: string[][];
};
type OpName = 'load' | 'list' | 'create' | 'update' | 'delete' | 'patch' | 'head' | 'options';
type ModelOp = {
    name: OpName;
    alts: ModelAlt[];
};
type ModelAlt = {
    orig: string;
    method: MethodName;
    parts: string[];
    args: Partial<{
        param: ModelArg[];
        query: ModelArg[];
        header: ModelArg[];
        cookie: ModelArg[];
    }>;
    select: {
        param: Record<string, true | string>;
    };
};
type ModelArg = {
    name: string;
    type: any;
    kind: 'param' | 'query' | 'header' | 'cookie';
    req: boolean;
};
type ModelField = {
    name: string;
    type: any;
    req: boolean;
    op: Partial<Record<OpName, ModelFieldOp>>;
};
type ModelFieldOp = {
    type: any;
    req: boolean;
};
type OpDesc = {
    paths: PathDesc[];
};
type PathDesc = {
    orig: string;
    method: MethodName;
    parts: string[];
    rename: GuidePathRename;
    op: GuidePath["op"];
    def: {
        parameters?: ParameterDef[];
    };
};
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
declare const topTransform: (ctx: any) => Promise<TransformResult>;
export { topTransform };
export type { PathDef, ParameterDef, MethodDef, SchemaDef, GuideEntity, GuidePath, GuideOp, PathDesc, ModelOpMap, ModelOp, ModelEntity, ModelAlt, ModelArg, ModelField, OpName, };
