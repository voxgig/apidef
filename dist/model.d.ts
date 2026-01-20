import type { MethodName } from './types';
type OpName = 'load' | 'list' | 'create' | 'update' | 'delete' | 'patch' | 'head' | 'options';
type ModelEntityRelations = {
    ancestors: string[][];
};
type ModelOpMap = Partial<Record<OpName, ModelOp | undefined>>;
type ModelFieldOp = {
    type: any;
    req: boolean;
};
type ModelField = {
    name: string;
    type: any;
    req: boolean;
    op: Partial<Record<OpName, ModelFieldOp>>;
};
type ModelArg = {
    name: string;
    orig: string;
    type: any;
    kind: 'param' | 'query' | 'header' | 'cookie';
    req: boolean;
};
type ModelAlt = {
    orig: string;
    method: MethodName;
    parts: string[];
    rename: Partial<{
        param: Record<string, string>;
        query: Record<string, string>;
        header: Record<string, string>;
        cookie: Record<string, string>;
    }>;
    args: Partial<{
        param: ModelArg[];
        query: ModelArg[];
        header: ModelArg[];
        cookie: ModelArg[];
    }>;
    transform: {
        req?: any;
        res?: any;
    };
    select: {
        exist: string[];
        $action?: string;
    };
};
type ModelOp = {
    name: OpName;
    alts: ModelAlt[];
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
export type { OpName, ModelEntityRelations, ModelOpMap, ModelFieldOp, ModelField, ModelArg, ModelAlt, ModelOp, ModelEntity, };
