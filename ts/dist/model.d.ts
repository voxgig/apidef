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
    n: string;
    h: string;
    t: any;
    r: boolean;
    op: Partial<Record<OpName, ModelFieldOp>>;
    sh?: string;
    ro?: boolean;
    wo?: boolean;
    de?: boolean;
    fo?: string;
    union?: {
        count: number;
        branches: number;
        depth: number;
    };
};
type ModelArg = {
    n: string;
    or?: string;
    t: any;
    k: ArgKind;
    r: boolean;
    ex?: any;
};
type PointKind = 'http' | 'graphql';
type ModelGraphqlPage = {
    style: string;
    nodes: string;
    cursor: string;
    more: string;
};
type ModelGraphqlVar = {
    name: string;
    from: string;
    gqltype: string;
};
type ModelGraphql = {
    optype: 'query' | 'mutation';
    field: string;
    doc: string;
    vars: ModelGraphqlVar[];
    page?: ModelGraphqlPage;
};
type ModelPathSegment = {
    lit?: string;
    var?: string;
};
type ModelPoint = {
    co?: {
        version: 2;
        id: string;
        source: string;
    };
    li?: boolean | Record<string, any>;
    o: string;
    k?: PointKind;
    gq?: ModelGraphql;
    m: MethodName;
    s: ModelPathSegment[];
    r: Partial<{
        param: Record<string, string>;
        query: Record<string, string>;
        header: Record<string, string>;
        cookie: Record<string, string>;
    }>;
    g: Partial<{
        params: ModelArg[];
        query: ModelArg[];
        header: ModelArg[];
        cookie: ModelArg[];
    }>;
    t: {
        req?: any;
        res?: any;
    };
    q: {
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
    fields: Record<string, ModelField>;
    id?: {
        name: string;
        field: string;
        parts?: string[];
        sep?: string;
        from?: Record<string, string>;
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
export type { OpName, ArgKind, PointKind, ModelGraphql, ModelGraphqlVar, ModelGraphqlPage, NamesCluster, Model, ModelEntityRelations, ModelOpMap, ModelFieldOp, ModelField, ModelArg, ModelPoint, ModelPathSegment, ModelOp, ModelEntity, ModelEntityFlow, ModelEntityFlowStep, ModelEntityFlowStepInput, ModelEntityFlowStepValidator, ModelEntityFlowStepSpec, };
