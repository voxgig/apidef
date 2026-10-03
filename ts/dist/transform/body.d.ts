import type { Transform } from '../transform';
import type { ModelBody } from '../model';
declare const bodyTransform: Transform;
declare function requestBody(def: any, method: string, path: string, media?: string): ModelBody | undefined;
declare function responseBody(def: any, method: string, path: string, media?: string): ModelBody | undefined;
declare function jsonRequestSchema(opdef: any): any;
declare function arrayRequestSchema(opdef: any): any;
declare function arrayRequestField(opdef: any, req: any): string | undefined;
export { bodyTransform, requestBody, responseBody, jsonRequestSchema, arrayRequestSchema, arrayRequestField, };
