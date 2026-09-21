import type { ApiDefOptions } from '../../types';
declare function resolveEntity(apimodel: any, opts: ApiDefOptions): () => void;
declare function entityAncestorSource(entity: any): {
    model: any;
    relations: string;
};
declare function gcEntityFiles(fs: any, log: any, modelFolder: string, outprefix: string | undefined, entityNames: string[]): string[];
export { resolveEntity, gcEntityFiles, entityAncestorSource, };
