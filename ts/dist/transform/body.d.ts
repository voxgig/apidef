import type { Transform } from '../transform';
import type { ModelBody } from '../model';
declare const bodyTransform: Transform;
declare function requestBody(def: any, method: string, path: string, media?: string): ModelBody | undefined;
declare function responseBody(def: any, method: string, path: string, media?: string): ModelBody | undefined;
export { bodyTransform, requestBody, responseBody, };
