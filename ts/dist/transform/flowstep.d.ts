import type { Transform } from '../transform';
import type { ModelEntity } from '../model';
declare const flowstepTransform: Transform;
declare function fileContent(content: 'bytes' | 'text', size: number, seed: number): Uint8Array | string;
declare function hasFileSteps(ent: ModelEntity): boolean;
export { fileContent, flowstepTransform, hasFileSteps, };
