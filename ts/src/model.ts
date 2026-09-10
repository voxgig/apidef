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
//
// `union` is present only when the field bottoms out in an UNTAGGED union —
// `oneOf`/`anyOf`, two or more branches, no `discriminator` — so the spec
// never says which variant a value is and the field can only be modelled as
// an open type. It records the widest such union found beneath the field, and
// exists so generators can SAY SO in the documentation rather than silently
// emitting a permissive type that looks like a modelling failure.
type ModelField = {
  name: string
  type: any // @voxgig/struct validation schema
  req: boolean
  op: Partial<Record<OpName, ModelFieldOp>>

  // One-line human description, straight from the spec's property
  // `description`. Absent when the spec does not describe the property —
  // generators render an empty cell rather than inventing prose.
  short?: string

  // SPEC FACTS ABOUT THE FIELD ITSELF, carried through verbatim from the
  // OpenAPI property. Facts the spec states, not inferences.
  //
  // `readOnly` is the load-bearing one: it is the difference between a field
  // a client MAY send and one it may not, which nothing else in this record
  // expresses. Without it every generator necessarily puts server-assigned
  // fields into the type a caller fills in.
  //
  // The booleans are present ONLY when the spec declares them true — each
  // defaults to false in OpenAPI, so absent and explicit-false mean the same
  // thing and emitting the false ones would change every model for no
  // information. `format` is present only for a non-empty string.
  readOnly?: boolean
  writeOnly?: boolean
  deprecated?: boolean
  format?: string
  union?: {
    count: number     // how many untagged unions lie beneath the field
    branches: number  // widest branch count among them
    depth: number     // how far down the widest one sits
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
  type: any // @voxgig/struct validation schema
  kind: ArgKind
  reqd: boolean
  example?: any
}


// Transport a point speaks. 'http' is the default and covers every
// OpenAPI-derived point; 'graphql' points carry a `graphql` block instead
// of relying on method+path (they synthesize method 'POST' and empty
// segments so the HTTP-shaped machinery downstream keeps working unchanged).
type PointKind = 'http' | 'graphql'


// Pagination descriptor for a GraphQL list op. `nodes`/`cursor`/`more` are
// dotted paths relative to the unwrapped connection object.
type ModelGraphqlPage = {
  style: string
  nodes: string
  cursor: string
  more: string
}


// One GraphQL variable binding: `name` is the variable as it appears in the
// operation document, `from` the op argument it is read from, `gqltype` the
// declared GraphQL type (e.g. 'String!').
type ModelGraphqlVar = {
  name: string
  from: string
  gqltype: string
}


// GraphQL wire data for a point. `doc` is the complete operation document,
// rendered single-line with sorted selection fields so output stays
// byte-stable and schema drift shows up in model diffs.
type ModelGraphql = {
  optype: 'query' | 'mutation'
  field: string
  doc: string
  vars: ModelGraphqlVar[]
  page?: ModelGraphqlPage
}


// One concrete endpoint that can satisfy an operation. An entity op
// (load/list/create/...) carries an array of these — apidef chooses
// between them at runtime via `select.exist` matching against reqmatch /
// reqdata. (Originally named `ModelTarget`; renamed for consistency with
// the field name `points` and the runtime utility `MakePoint`.)
// One resolved path segment (ADR-003). Exactly one of `lit` / `var` is set;
// `var` names an entry of the point's `args.params`.
type ModelPathSegment = {
  lit?: string
  var?: string
}


type ModelPoint = {
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
    // COMPOSITE IDENTITY. Present only when the API addresses one record by
    // MORE THAN ONE path parameter, so no single parameter is the id.
    // github's repo is the case: GET /repos/{owner}/{repo} needs both, and
    // neither alone names a repository.
    //
    // `parts` are those parameters in path order; `sep` joins them into the
    // one `id` an SDK entity carries. Absent means the ordinary single-key
    // entity, so downstream can branch on presence alone.
    parts?: string[]
    sep?: string
    // WHERE EACH PART'S VALUE LIVES IN A RESPONSE, as a dotted path into the
    // record. A path parameter's name is not generally a response field's
    // name: github's repo is addressed by {owner}/{repo}, and the response
    // carries `owner` as an OBJECT (the value is `owner.login`) and the
    // repository name as `name`, never `repo`. Without this an SDK can
    // address a record it was given the id of, but cannot work out the id of
    // a record the API just handed back — so a created or listed record has
    // no id at all.
    //
    // Only the parts that could be resolved appear. A part that is absent is
    // absent on purpose: nothing in the spec relates it to a response field,
    // and guessing would put a wrong id on a real record.
    from?: Record<string, string>
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
