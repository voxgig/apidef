import type { Transform } from '../transform';
import type { ModelBody, ModelPoint } from '../model';
declare const bodyTransform: Transform;
declare function guideMedia(guide: any, entname: string, opname: string, mpoint: ModelPoint): {
    body?: string;
    response?: string;
};
declare function requestBody(def: any, method: string, path: string, media?: string): ModelBody | undefined;
declare function responseBody(def: any, method: string, path: string, media?: string): ModelBody | undefined;
declare function jsonRequestSchema(opdef: any): any;
declare function requestSchema(def: any, method: string, path: string, media?: string): any;
declare function arrayRequestSchema(def: any, method: string, path: string, media?: string): any;
declare function arrayCarrier(def: any, mpoint: ModelPoint, media?: string): {
    name: string;
    required: boolean;
    type: string | string[];
    description?: string;
} | undefined;
declare function sameType(a: any, b: any): boolean;
export { bodyTransform, guideMedia, requestBody, responseBody, jsonRequestSchema, requestSchema, arrayRequestSchema, arrayCarrier, sameType, };
