import type { ApiDefOptions, ApiDefResult } from './types';
import { KIT } from './types';
import { parse } from './parse';
import { nom, formatJSONIC, getModelPath } from './utility';
declare function ApiDef(opts: ApiDefOptions): {
    generate: (spec: any) => Promise<ApiDefResult>;
};
declare namespace ApiDef {
    var makeBuild: (opts: ApiDefOptions) => Promise<{
        (model: any, build: any, _ctx: any): Promise<any>;
        step: string;
    }>;
}
export type { ApiDefOptions, };
export type { PathDef, MethodDef, ServerDef, ServerVariableDef, ParameterDef, SchemaDef, } from './def';
export type { CmpDesc, BasicMethodDesc, MethodDesc, MethodEntityDesc, EntityDesc, EntityPathDesc, PathDesc, OpDesc, } from './desc';
export type { OpName, ModelEntityRelations, ModelOpMap, ModelFieldOp, ModelField, ModelArg, ModelAlt, ModelOp, ModelEntity, } from './model';
export { KIT, ApiDef, parse, formatJSONIC, getModelPath, nom, };
