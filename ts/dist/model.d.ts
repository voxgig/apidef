import type { MethodName } from './types';
type OpName = 'load' | 'list' | 'create' | 'update' | 'remove' | 'patch' | 'head' | 'options';
type ArgKind = 'param' | 'query' | 'header' | 'cookie';
type NamesCluster = {
    name: string;
    Name: string;
    NAME: string;
};
type Model = NamesCluster & {
    origin?: string;
    def?: string;
    const: NamesCluster & {
        year?: number;
    };
    main: {
        kit: {
            info: any;
            config: any;
            entity: Record<string, ModelEntity>;
            feature: Record<string, any>;
            flow: Record<string, ModelEntityFlow>;
            target: Record<string, any>;
            option?: Record<string, any>;
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
    kind: ArgKind;
    reqd: boolean;
    example?: any;
};
type ModelPoint = {
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
        params: ModelArg[];
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
    points: ModelPoint[];
};
type ModelEntity = {
    name: string;
    Name?: string;
    NAME?: string;
    op: ModelOpMap;
    fields: ModelField[];
    id?: {
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
    active?: boolean;
};
type ModelEntityFlowStepInput = {
    ref?: string;
    entvar?: string;
    matchvar?: string;
    datavar?: string;
    listvar?: string;
    resdatavar?: string;
    markdefvar?: string;
    srcdatavar?: string;
    suffix?: string;
    textfield?: string;
    id?: any;
    [extra: string]: any;
};
type ModelEntityFlowStepValidator = {
    apply: string;
    def: Record<string, any>;
};
type ModelEntityFlowStepSpec = {
    apply: string;
    def: Record<string, any>;
};
type ModelEntityFlowStep = {
    op: OpName;
    input: ModelEntityFlowStepInput;
    match: Record<string, any>;
    data: Record<string, any>;
    spec: ModelEntityFlowStepSpec[];
    valid: ModelEntityFlowStepValidator[];
};
export type { OpName, ArgKind, NamesCluster, Model, ModelEntityRelations, ModelOpMap, ModelFieldOp, ModelField, ModelArg, ModelPoint, ModelOp, ModelEntity, ModelEntityFlow, ModelEntityFlowStep, ModelEntityFlowStepInput, ModelEntityFlowStepValidator, ModelEntityFlowStepSpec, };
