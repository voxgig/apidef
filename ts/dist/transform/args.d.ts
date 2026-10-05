import type { Transform } from '../transform';
import type { ModelPoint } from '../model';
declare const argsTransform: Transform;
declare function routeArgNames(def: any, mpoint: ModelPoint): string[];
declare function resolveArgExample(argdef: any, schema: any): any;
export { argsTransform, resolveArgExample, routeArgNames, };
