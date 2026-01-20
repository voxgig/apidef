/* Copyright (c) 2024-2025 Voxgig, MIT License */

// Consolidated model types for the API model derived from OpenAPI specifications

import type { MethodName } from './types'


// Operation names available on entities
type OpName = 'load' | 'list' | 'create' | 'update' | 'delete' | 'patch' | 'head' | 'options'


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


// Operation argument/parameter definition
type ModelArg = {
  name: string
  orig: string
  type: any // @voxgig/struct validation schema
  kind: 'param' | 'query' | 'header' | 'cookie'
  req: boolean
}


// Alternative implementation of an operation
type ModelAlt = {
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
    param: ModelArg[]
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
  alts: ModelAlt[]
}


// Entity definition - core model entity with operations and fields
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


export type {
  OpName,
  ModelEntityRelations,
  ModelOpMap,
  ModelFieldOp,
  ModelField,
  ModelArg,
  ModelAlt,
  ModelOp,
  ModelEntity,
}
