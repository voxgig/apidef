
import { each, getx } from 'jostraca'

import { joinurl } from '@voxgig/struct'

import type { TransformResult } from '../transform'

import { fixName } from '../transform'


// Guide* => from guide model
// *Desc => internal working descriptiuon
// *Def => API spec definition
// Model* => Generated SDK Model


type GuideEntity = {
  name: string,
  path: Record<string, GuidePath>

  paths$: PathDesc[]
  opm$: Record<OpName, OpDesc>
}


type GuidePath = {
  rename?: GuidePathRename
  op?: Record<string, GuideOp>
}


type GuidePathRename = {
  param?: Record<string, string>
}

type GuideOp = {
  method: MethodName
}

type MethodName = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | ''


type ModelEntity = {
  name: string,
  op: ModelOpMap,
  field: {},
  id: {
    name: string,
    field: string,
  },
  relations: ModelEntityRelations
}

type ModelOpMap = Record<OpName, ModelOp | undefined>

type ModelEntityRelations = {
  ancestors: string[][]
}


type OpName = 'load' | 'list' | 'create' | 'update' | 'delete' | 'patch'

type ModelOp = {
  name: OpName
  alts: ModelAlt[]
}


type ModelAlt = {
  orig: string
  method: MethodName
  parts: string[]
  select: {
    param: Record<string, true | string>
  }
}


type OpDesc = {
  paths: PathDesc[]
}


type PathDesc = {
  orig: string
  method: MethodName
  parts: string[]
  rename: GuidePathRename
  op: GuidePath["op"]
  def: {
    parameters?: ParameterDef[]
  }
}


type ParameterDef = {
  name: string
  in: "query" | "header" | "path" | "cookie"
  description?: string
  required?: boolean
  deprecated?: boolean
  schema?: ParameterSchemaDef
}


type ParameterSchemaDef = {
  title?: string
  description?: string
  type?: string
  format?: string
  enum?: any[]
  items?: ParameterSchemaDef
  properties?: Record<string, ParameterSchemaDef>
  required?: string[]
  additionalProperties?: boolean | ParameterSchemaDef
  allOf?: ParameterSchemaDef[]
  oneOf?: ParameterSchemaDef[]
  anyOf?: ParameterSchemaDef[]
  nullable?: boolean
  default?: any
  example?: any
}


const topTransform = async function(
  ctx: any,
): Promise<TransformResult> {
  const { apimodel, def } = ctx

  apimodel.main.def.info = def.info
  apimodel.main.def.servers = def.servers ?? []

  // Swagger 2.0
  if (def.host) {
    apimodel.main.def.servers.push({
      url: (def.schemes?.[0] ?? 'https') + '://' + joinurl([def.host, def.basePath])
    })
  }

  return { ok: true, msg: 'top' }
}


export {
  topTransform
}

export type {
  GuideEntity,
  GuidePath,
  GuideOp,
  PathDesc,
  ModelOpMap,
  ModelOp,
  ModelEntity,
  OpName,
}
