/* Copyright (c) 2024-2025 Voxgig, MIT License */

// Consolidated model types for the API model derived from OpenAPI specifications

import type { MethodName } from './types'


// Operation names available on entities
type OpName = 'load' | 'list' | 'create' | 'update' | 'remove' | 'patch' | 'head' | 'options'


// Argument kinds supported on operation points.
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


// Entity relationships information
type ModelEntityRelations = {
  ancestors: string[][]
}


// Map of operations available on an entity
type ModelOpMap = Partial<Record<OpName, ModelOp | undefined>>


// Field-specific operation configuration
type ModelFieldOp = {
  type: any // @voxgig/struct validation schema
  req: boolean
}


// Entity field definition
type ModelField = {
  name: string
  type: any // @voxgig/struct validation schema
  req: boolean
  op: Partial<Record<OpName, ModelFieldOp>>
}


// Operation argument/parameter definition.
// `example` captures a value the spec advertises (parameter `example`,
// the first entry of `examples`, or `schema.example`/`schema.default`).
// Test generators use this for required params in live test setup so the
// generated request actually satisfies the API contract.
type ModelArg = {
  name: string
  orig: string
  type: any // @voxgig/struct validation schema
  kind: ArgKind
  reqd: boolean
  example?: any
}


// One concrete HTTP endpoint that can satisfy an operation. An entity op
// (load/list/create/...) carries an array of these — apidef chooses
// between them at runtime via `select.exist` matching against reqmatch /
// reqdata. (Originally named `ModelTarget`; renamed for consistency with
// the field name `points` and the runtime utility `MakePoint`.)
type ModelPoint = {
  orig: string
  method: MethodName
  parts: string[]
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


// Operation definition
type ModelOp = {
  name: OpName
  points: ModelPoint[]
}


// Entity definition - core model entity with operations and fields.
// `id` is present only when the OpenAPI response/request schema declares
// (or examples imply) an `id` field on the entity. Public APIs that return
// payloads without an id (e.g. read-only feeds) leave it undefined.
//
// `Name`, `NAME` etc. are stamped on by jostraca's `names()` helper after
// apidef hands the model to the generator. They're typed as optional here
// so apidef's transform code can construct entities without them; template
// code should reach for them through `nom(entity, 'Name')` rather than
// direct property access, which both works pre-`names()` and lets us
// remove the optional later.
type ModelEntity = {
  name: string
  Name?: string
  NAME?: string
  op: ModelOpMap
  fields: ModelField[]
  id?: {
    name: string
    field: string
  }
  relations: ModelEntityRelations
}


type ModelEntityFlow = {
  name: string,
  entity: string
  kind: string
  // args: Record<string, string>
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


// Validators and specs are user-supplied callables identified by the
// `apply` discriminator; `def` is the validator-specific options bag.
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
  NamesCluster,
  Model,
  ModelEntityRelations,
  ModelOpMap,
  ModelFieldOp,
  ModelField,
  ModelArg,
  ModelPoint,
  ModelOp,
  ModelEntity,
  ModelEntityFlow,
  ModelEntityFlowStep,
  ModelEntityFlowStepInput,
  ModelEntityFlowStepValidator,
  ModelEntityFlowStepSpec,
}
