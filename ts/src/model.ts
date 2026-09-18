/* Copyright (c) 2024-2025 Voxgig, MIT License */


import type { MethodName } from './types'


type OpName = 'load' | 'list' | 'create' | 'update' | 'remove' | 'patch' | 'head' | 'options'


type ArgKind = 'param' | 'query' | 'header' | 'cookie'


// jostraca's `names()` helper sticks several stylised forms of the project
// name onto an object: `name`, `Name`, `NAME`, plus snake/dash variants.
// Templates that reach for any of these expect the cluster to be present.
type NamesCluster = {
  name: string
  Name: string
  NAME: string
}


// Top-level unified API model produced by apidef + voxgig-model. Templates
// access the kit through `model.main.kit.<thing>`. The `info`, `config`,
// `feature`, and `target` kits remain `any` for now because their shapes are
// less stable than entity/flow — Phase 2 of the refactor types them.
type Model = NamesCluster & {
  origin?: string
  def?: string

  const: NamesCluster & {
    year?: number
  }

  main: {
    kit: {
      info: any
      config: any
      entity: Record<string, ModelEntity>
      feature: Record<string, any>
      flow: Record<string, ModelEntityFlow>
      target: Record<string, any>
      option?: Record<string, any>
    }
  }
}


type ModelEntityRelations = {
  ancestors: string[][]
}


type ModelOpMap = Partial<Record<OpName, ModelOp | undefined>>


type ModelFieldOp = {
  type: any
  req: boolean
}


type ModelField = {
  name: string
  type: any
  req: boolean
  op: Partial<Record<OpName, ModelFieldOp>>

  short?: string

  readOnly?: boolean
  writeOnly?: boolean
  deprecated?: boolean
  format?: string
  union?: {
    count: number
    branches: number
    depth: number
  }
}


// Operation argument/parameter definition.
// `example` captures a value the spec advertises (parameter `example`,
// the first entry of `examples`, or `schema.example`/`schema.default`).
// Test generators use this for required params in live test setup so the
// generated request actually satisfies the API contract.
type ModelArg = {
  name: string
  orig: string
  type: any
  kind: ArgKind
  reqd: boolean
  example?: any
}


// Transport a point speaks. 'http' is the default and covers every
// OpenAPI-derived point; 'graphql' points carry a `graphql` block instead
// of relying on method+path (they synthesize method 'POST' and empty
// segments so the HTTP-shaped machinery downstream keeps working unchanged).
type PointKind = 'http' | 'graphql'


type ModelGraphqlPage = {
  style: string
  nodes: string
  cursor: string
  more: string
}


type ModelGraphqlVar = {
  name: string
  from: string
  gqltype: string
}


type ModelGraphql = {
  optype: 'query' | 'mutation'
  field: string
  doc: string
  vars: ModelGraphqlVar[]
  page?: ModelGraphqlPage
}


type ModelPathSegment = {
  lit?: string
  var?: string
}


type ModelPoint = {
  contract?: { version: number, id: string, source: string, json: string }
  orig: string
  kind?: PointKind
  graphql?: ModelGraphql
  method: MethodName
  segments: ModelPathSegment[]
  rename: Partial<{
    param: Record<string, string>
    query: Record<string, string>
    header: Record<string, string>
    cookie: Record<string, string>
  }>
  args: Partial<{
    params: ModelArg[]
    query: ModelArg[]
    header: ModelArg[]
    cookie: ModelArg[]
  }>
  transform: {
    req?: any
    res?: any
  }
  select: {
    exist: string[]
    $action?: string
  }
}


type ModelOp = {
  name: OpName
  points: ModelPoint[]
}


type ModelEntity = {
  name: string
  Name?: string
  NAME?: string
  op: ModelOpMap
  fields: ModelField[]
  id?: {
    name: string
    field: string
    parts?: string[]
    sep?: string
    from?: Record<string, string>
  }
  relations: ModelEntityRelations
}


type ModelEntityFlow = {
  name: string,
  entity: string
  kind: string
  step: ModelEntityFlowStep[]
  active?: boolean
}


// Per-step input cluster. Test-generators name the variables they emit by
// reading these slots, falling back to derived defaults. All fields are
// optional — `newFlowStep` in transform/flowstep.ts guarantees the input
// object itself exists, so consumers don't need to null-check `step.input`.
type ModelEntityFlowStepInput = {
  ref?: string
  entvar?: string
  matchvar?: string
  datavar?: string
  listvar?: string
  resdatavar?: string
  markdefvar?: string
  srcdatavar?: string
  suffix?: string
  textfield?: string
  id?: any
  [extra: string]: any
}


type ModelEntityFlowStepValidator = {
  apply: string
  def: Record<string, any>
}

type ModelEntityFlowStepSpec = {
  apply: string
  def: Record<string, any>
}


type ModelEntityFlowStep = {
  op: OpName
  input: ModelEntityFlowStepInput
  match: Record<string, any>
  data: Record<string, any>
  spec: ModelEntityFlowStepSpec[]
  valid: ModelEntityFlowStepValidator[]
}


export type {
  OpName,
  ArgKind,
  PointKind,
  ModelGraphql,
  ModelGraphqlVar,
  ModelGraphqlPage,
  NamesCluster,
  Model,
  ModelEntityRelations,
  ModelOpMap,
  ModelFieldOp,
  ModelField,
  ModelArg,
  ModelPoint,
  ModelPathSegment,
  ModelOp,
  ModelEntity,
  ModelEntityFlow,
  ModelEntityFlowStep,
  ModelEntityFlowStepInput,
  ModelEntityFlowStepValidator,
  ModelEntityFlowStepSpec,
}
