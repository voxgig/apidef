type GqlArg = {
    name: string;
    gqltype: string;
    type: string;
    reqd: boolean;
    deflt?: any;
};
type GqlField = {
    name: string;
    gqltype: string;
    type: string;
    reqd: boolean;
    list: boolean;
    args: GqlArg[];
    deprecated: boolean;
    desc?: string;
};
type GqlType = {
    name: string;
    kind: string;
    fields: Record<string, GqlField>;
    values?: string[];
    possible?: string[];
    interfaces?: string[];
    desc?: string;
};
type GqlDef = {
    graphql: true;
    info: Record<string, any>;
    servers: {
        url: string;
    }[];
    types: Record<string, GqlType>;
    query: Record<string, GqlField>;
    mutation: Record<string, GqlField>;
    subscription: Record<string, GqlField>;
};
declare function parseGraphQL(source: string, meta: {
    file: string;
}, opts?: {
    endpoint?: string;
    title?: string;
    version?: string;
}): Promise<GqlDef>;
export { parseGraphQL, };
export type { GqlDef, GqlType, GqlField, GqlArg, };
