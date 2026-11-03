import type { Transform } from '../transform';
import type { SchemaDef } from '../def';
import type { ModelEntity, ModelPoint } from '../model';
declare const fieldTransform: Transform;
declare function singleIdentity(ment: ModelEntity, gid?: any, def?: any, wires?: Record<string, Set<string>>): {
    field?: string;
    from?: Record<string, string>;
};
declare function routeFieldNames(ment: ModelEntity, opname: string, mpoint: ModelPoint, def: any, media?: string): string[];
declare function inferFieldsFromExamples(opdef: any, envelope?: string | null): SchemaDef[];
declare function inferTypeFromValue(value: any): string;
export { fieldTransform, inferFieldsFromExamples, inferTypeFromValue, routeFieldNames, singleIdentity, };
