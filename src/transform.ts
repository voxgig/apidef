/* Copyright (c) 2024 Voxgig, MIT License */


import Path from 'node:path'

import { getx, each, camelify } from 'jostraca'

import { Gubu, Child, Exact } from 'gubu'

import { topTransform } from './transform/top'
import { entityTransform } from './transform/entity'
import { operationTransform } from './transform/operation'
import { argsTransform } from './transform/args'
import { selectTransform } from './transform/select'
import { fieldTransform } from './transform/field'
// import { manualTransform } from './transform/manual'



type TransformCtx = {
  log: any,
  spec: any,
  model: any,
  opts: any,
  util: any,
  defpath: string,
}

type TransformSpec = {
  transform: Transform[]
}

type TransformResult = {
  ok: boolean
  msg: string
  err?: any
  transform?: any
}

type Transform = (
  ctx: TransformCtx,
  // guide: Guide,
  // tspec: TransformSpec,
  // apimodel: any,
  // def: any,
) => Promise<TransformResult>

type ProcessResult = {
  ok: boolean
  msg: string,
  results: TransformResult[]
}


const TRANSFORM: Record<string, Transform> = {
  top: topTransform,
  entity: entityTransform,
  operation: operationTransform,
  args: argsTransform,
  select: selectTransform,
  field: fieldTransform,
  // manual: manualTransform,
}



const OPKIND: any = {
  list: 'res',
  load: 'res',
  remove: 'res',
  create: 'req',
  update: 'req',
}


const GuideShape = Gubu({
  entity: {},
  control: {},
  transform: {},
  manual: {},
})

type Guide = ReturnType<typeof GuideShape>



function fixName(base: any, name: string, prop = 'name') {
  if (null != base && 'object' === typeof base && 'string' === typeof name) {
    base[prop.toLowerCase()] = name.toLowerCase()
    base[camelify(prop)] = camelify(name)
    base[prop.toUpperCase()] = name.toUpperCase()
  }
  else {
    // record to a "wierds" log
  }
}





export type {
  TransformCtx,
  TransformSpec,
  Transform,
  TransformResult,
  Guide,
}


export {
  fixName,
  OPKIND,
  GuideShape,
  // resolveTransforms,
  // processTransforms,
}
