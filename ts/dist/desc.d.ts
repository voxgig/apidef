import type { PathMatch } from './utility';
import type { MethodName } from './types';
import type { ParameterDef } from './def';
type CmpDesc = {
    namedesc?: any;
    path_rate: number;
    method_rate: number;
};
type BasicMethodDesc = {
    name: MethodName;
    def: Record<string, any>;
    path: string;
};
type MethodDesc = {
    path: string;
    method: string;
    summary: string;
    tags: string[];
    parameters: any[];
    responses: Record<string, any>;
    requestBody: Record<string, any>;
    MethodEntity: MethodEntityDesc;
};
type MethodEntityDesc = {
    ref: string;
    cmp: string | null;
    origcmp: string | null;
    origcmpref: string | null;
    why_cmp: string[];
    cmpoccur: number;
    path_rate: number;
    method_rate: number;
    entname: string;
    why_op: string[];
    rename: Record<string, any>;
    why_rename: Record<string, any>;
    rename_orig: string[];
    opname: string;
    why_opname: string[];
    pm?: any;
};
type EntityDesc = {
    name: string;
    origname: string;
    plural: string;
    path: Record<string, EntityPathDesc>;
    alias: Record<string, string>;
    cmp: CmpDesc;
};
type EntityPathDesc = {
    op: Record<string, any>;
    pm: PathMatch;
    rename: {
        param: Record<string, string>;
    };
    why_rename: {
        why_param: Record<string, string[]>;
    };
    action: Record<string, {
        why_action: string[];
    }>;
    why_action: Record<string, string[]>;
    why_ent: string[];
    why_path: string[];
};
type PathDesc = {
    orig: string;
    method: MethodName;
    parts: string[];
    rename: {
        param?: Record<string, any>;
    };
    op: Record<string, {
        method: any;
        transform: {
            req?: any;
            res?: any;
        };
    }>;
    def: {
        parameters?: ParameterDef[];
    };
};
type OpDesc = {
    paths: PathDesc[];
};
export type { CmpDesc, BasicMethodDesc, MethodDesc, MethodEntityDesc, EntityDesc, EntityPathDesc, PathDesc, OpDesc, };
