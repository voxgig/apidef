import type { Transform } from '../transform';
import type { ModelRequestBody } from '../model';
declare const bodyTransform: Transform;
declare function requestBody(def: any, method: string, path: string, media?: string): ModelRequestBody | undefined;
export { bodyTransform, requestBody, };
