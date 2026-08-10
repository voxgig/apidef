import type { Transform } from '../transform';
import type { ModelGraphqlVar } from '../model';
declare function selectionFields(typeName: string, def: any): string[];
declare function renderDoc(opname: string, optype: string, field: string, vars: ModelGraphqlVar[], selection: string, fragName: string, fragType: string, fragFields: string[]): string;
declare const graphqlTransform: Transform;
export { graphqlTransform, selectionFields, renderDoc, };
