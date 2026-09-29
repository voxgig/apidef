import type { Transform } from '../transform';
import type { SchemaDef } from '../def';
declare const fieldTransform: Transform;
declare function inferFieldsFromExamples(opdef: any, envelope?: string | null): SchemaDef[];
declare function inferTypeFromValue(value: any): string;
export { fieldTransform, inferFieldsFromExamples, inferTypeFromValue, };
