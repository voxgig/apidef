import type { MethodName } from './types';
type OpName = 'load' | 'list' | 'create' | 'update' | 'remove' | 'patch' | 'head' | 'options';
type Model = {
    name: string;
    origin?: string;
    main: {
        kit: {
            entity: Record<string, ModelEntity>;
        };
    };
};
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
    reqd: boolean;
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
type ModelEntityFlow = {
    name: string;
    entity: string;
    kind: string;
    step: ModelEntityFlowStep[];
};
type ModelEntityFlowStep = {
    op: OpName;
    input: Record<string, any>;
    match: Record<string, any>;
    data: Record<string, any>;
    spec: {
        apply: string;
        def: Record<string, any>;
    }[];
    valid: {
        apply: string;
        def: Record<string, any>;
    }[];
};
export type { OpName, Model, ModelEntityRelations, ModelOpMap, ModelFieldOp, ModelField, ModelArg, ModelAlt, ModelOp, ModelEntity, ModelEntityFlow, ModelEntityFlowStep, };
