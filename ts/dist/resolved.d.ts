declare const METHODS: string[];
type OperationFacts = {
    protocol: 'http' | 'graphql';
    [key: string]: any;
};
type OperationSelector = {
    entity: string;
    op: string;
};
type ResolvedSpec = {
    version: 1;
    kind: string;
    def: any;
    operation(method: string, path: string, selector?: OperationSelector): OperationFacts | undefined;
};
declare function operationFacts(def: any, point: {
    method: string;
    orig: string;
}): OperationFacts | undefined;
declare function operationIndex(def: any): {
    [id: string]: OperationFacts;
};
declare function makeResolved(kind: string, def: any, guide?: () => any): ResolvedSpec;
declare function publishResolved(ctx: any, kind: string, def: any, guide?: () => any): ResolvedSpec;
declare function resolvedSpec(carrier: any): ResolvedSpec | undefined;
export type { OperationSelector, OperationFacts, ResolvedSpec, };
export { METHODS, operationFacts, operationIndex, makeResolved, publishResolved, resolvedSpec, };
