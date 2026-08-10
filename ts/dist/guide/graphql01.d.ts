import type { ApiDefContext, Guide } from '../types';
import type { GqlField, GqlType } from '../parse/graphql';
type GqlOpName = 'load' | 'list' | 'create' | 'update' | 'remove';
type GqlRetShape = {
    kind: 'entity' | 'connection' | 'list' | 'payload' | 'scalar' | 'other';
    entity?: string;
    nodes?: string;
    unwrap?: string;
    deleteish?: boolean;
};
type GqlArgSig = {
    name: string;
    gqltype: string;
    reqd: boolean;
};
type GqlFieldSig = {
    optype: 'query' | 'mutation';
    name: string;
    args: GqlArgSig[];
    ret: GqlRetShape;
    inputTypeName?: string;
};
type GqlClassification = {
    exclude?: boolean;
    entity?: string;
    op?: GqlOpName;
    action?: string;
    optype?: 'query' | 'mutation';
    why: string[];
};
type GqlProfile = 'linear' | 'relay' | 'none';
declare function classifyGraphQLField(sig: GqlFieldSig, profile: GqlProfile): GqlClassification;
declare function deriveRetShape(field: GqlField, types: Record<string, GqlType>): GqlRetShape;
declare function fieldSig(optype: 'query' | 'mutation', field: GqlField, types: Record<string, GqlType>): GqlFieldSig;
declare function entityName(typeName: string): string;
declare function graphql01(ctx: ApiDefContext): Promise<Guide>;
export { graphql01, classifyGraphQLField, deriveRetShape, fieldSig, entityName, };
export type { GqlFieldSig, GqlArgSig, GqlRetShape, GqlClassification, GqlProfile, GqlOpName, };
