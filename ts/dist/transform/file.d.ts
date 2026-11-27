import type { ModelBody, ModelEntity, ModelBinary } from '../model';
import type { GuideBinary } from '../types';
type SessionMatch = {
    dialect: string;
    active: boolean;
    own: string[];
};
declare function sessionDialect(method: string, media: string[], headers: string[]): SessionMatch | undefined;
declare function binarySlot(def: any, pathStr: string, methods: string[], record: any, action: string): GuideBinary | undefined;
declare function pointBinary(method: string, rb: ModelBody | undefined, rs: ModelBody | undefined, binary: any): ModelBinary | undefined;
declare function markFileSlots(guide: any, def: any, recordOf: (entity: any) => any): void;
declare function markSessions(guide: any, def: any): void;
declare function applySession(guide: any, ment: ModelEntity): void;
export { applySession, binarySlot, markFileSlots, markSessions, pointBinary, sessionDialect, };
