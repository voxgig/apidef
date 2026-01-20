/* Copyright (c) 2024-2025 Voxgig, MIT License */

// Consolidated intermediate analysis types for OpenAPI definition processing

import type { PathMatch } from './utility'
import type { MethodName } from './types'
import type { ParameterDef } from './def'



// // Intermediate Guide types used during analysis
// type GuidePathRename = {
//   param?: Record<string, string>
// }

// type GuideOp = {
//   method: MethodName
// }

// type GuidePath = {
//   rename?: GuidePathRename
//   op?: Record<string, GuideOp>
// }


// Component analysis description
type CmpDesc = {
  namedesc?: any,
  path_rate: number,
  method_rate: number,
}


// Basic method description from types.ts (renamed to avoid conflict)
type BasicMethodDesc = {
  name: MethodName,
  def: Record<string, any>,
  path: string,
}


// Detailed method analysis description from heuristic01.ts
type MethodDesc = {
  path: string
  method: string
  summary: string
  tags: string[]
  parameters: any[]
  responses: Record<string, any>
  requestBody: Record<string, any>
  MethodEntity: MethodEntityDesc
}


// Method entity relationship analysis
type MethodEntityDesc = {
  ref: string

  cmp: string | null
  origcmp: string | null
  origcmpref: string | null

  why_cmp: string[]
  cmpoccur: number
  path_rate: number
  method_rate: number
  entname: string
  why_op: string[]
  rename: Record<string, any>
  why_rename: Record<string, any>
  rename_orig: string[]
  opname: string
  why_opname: string[]

  pm?: any
}


// Entity analysis description
type EntityDesc = {
  name: string
  origname: string
  plural: string
  path: Record<string, EntityPathDesc>
  alias: Record<string, string>,
  cmp: CmpDesc
}


// Entity path relationship analysis
type EntityPathDesc = {
  op: Record<string, any>
  pm: PathMatch

  rename: {
    param: Record<string, string>
  }
  why_rename: {
    why_param: Record<string, string[]>
  }

  action: Record<string, {
    why_action: string[]
  }>

  why_action: Record<string, string[]>

  why_ent: string[]
  why_path: string[]
}


// Path analysis description
type PathDesc = {
  orig: string
  method: MethodName
  parts: string[]
  // rename: GuidePathRename
  rename: {
    param?: Record<string, any>
  }
  // op: GuidePath["op"]
  op: Record<string, {
    method: any
    transform: {
      req?: any
      res?: any
    }
  }>
  def: {
    parameters?: ParameterDef[]
  }
}


// Operation analysis description
type OpDesc = {
  paths: PathDesc[]
}


export type {
  //  GuidePathRename,
  //  GuideOp,
  //  GuidePath,
  CmpDesc,
  BasicMethodDesc,
  MethodDesc,
  MethodEntityDesc,
  EntityDesc,
  EntityPathDesc,
  PathDesc,
  OpDesc,
}
