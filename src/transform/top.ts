
import { each, getx } from 'jostraca'

import { joinurl } from '@voxgig/struct'

import type { TransformResult } from '../transform'

import type {
  TypeName,
  MethodName,
} from '../types'


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

type ModelEntity = {
  name: string,
  op: ModelOpMap,
  fields: ModelField[],
  id: {
    name: string,
    field: string,
  },
  relations: ModelEntityRelations
}


type ModelOpMap = Partial<Record<OpName, ModelOp | undefined>>


type ModelEntityRelations = {
  ancestors: string[][]
}


type OpName = 'load' | 'list' | 'create' | 'update' | 'delete' | 'patch' | 'head' | 'options'

type ModelOp = {
  name: OpName
  alts: ModelAlt[]
}


type ModelAlt = {
  orig: string
  method: MethodName
  parts: string[]
  args: Partial<{
    param: ModelArg[]
    query: ModelArg[]
    header: ModelArg[]
    cookie: ModelArg[]
  }>
  select: {
    param: Record<string, true | string>
  }
}


type ModelArg = {
  name: string
  type: any // @voxgig/struct validation schema
  kind: 'param' | 'query' | 'header' | 'cookie'
  req: boolean
}


type ModelField = {
  name: string
  type: any // @voxgig/struct validation schema
  req: boolean
  op: Partial<Record<OpName, ModelFieldOp>>
}


type ModelFieldOp = {
  type: any // @voxgig/struct validation schema
  req: boolean
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



type PathDef = {
  summary?: string
  description?: string
  get?: MethodDef
  put?: MethodDef
  post?: MethodDef
  delete?: MethodDef
  options?: MethodDef
  head?: MethodDef
  patch?: MethodDef
  trace?: MethodDef
  servers?: ServerDef[]
  parameters?: ParameterDef[]
  tags?: any
}


type MethodDef = {
  tags?: string[]
  summary?: string
  description?: string
  operationId?: string
  parameters?: ParameterDef[]
  // requestBody?: RequestBodyObject | ReferenceDef
  // responses: Record<string, ResponseObject | ReferenceDef>
  // callbacks?: Record<string, CallbackObject | ReferenceDef>
  deprecated?: boolean
  // security?: SecurityRequirementDef[]
  servers?: ServerDef[]
}


type ServerDef = {
  url: string
  description?: string
  variables?: Record<string, ServerVariableDef>
}

type ServerVariableDef = {
  enum?: string[]
  default: string
  description?: string
}

type ParameterDef = {
  name: string
  in: "query" | "header" | "path" | "cookie"
  description?: string
  required?: boolean
  deprecated?: boolean
  schema?: SchemaDef
  nullable?: boolean
  example?: any
  // examples?: Record<string, ExampleObject | ReferenceDef>
}


type SchemaDef = {
  title?: string
  description?: string
  type?: string
  format?: string
  enum?: any[]
  items?: SchemaDef
  properties?: Record<string, SchemaDef>
  required?: string[]
  additionalProperties?: boolean | SchemaDef
  allOf?: SchemaDef[]
  oneOf?: SchemaDef[]
  anyOf?: SchemaDef[]
  nullable?: boolean
  default?: any
  example?: any
}


const topTransform = async function(
  ctx: any,
): Promise<TransformResult> {
  const { apimodel, def } = ctx

  apimodel.main.sdk.info = def.info
  apimodel.main.sdk.info.servers = def.servers ?? []

  // Swagger 2.0
  if (def.host) {
    apimodel.main.sdk.info.servers.push({
      url: (def.schemes?.[0] ?? 'https') + '://' + joinurl([def.host, def.basePath])
    })
  }

  return { ok: true, msg: 'top' }
}


export {
  topTransform
}

export type {
  PathDef,
  ParameterDef,
  MethodDef,
  SchemaDef,
  GuideEntity,
  GuidePath,
  GuideOp,
  PathDesc,
  ModelOpMap,
  ModelOp,
  ModelEntity,
  ModelAlt,
  ModelArg,
  ModelField,
  OpName,
}
