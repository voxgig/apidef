/* Copyright (c) 2024 Voxgig, MIT License */


import Path from 'node:path'

import { getx, each, camelify } from 'jostraca'

import { Gubu, Child, Exact } from 'gubu'

import { topTransform } from './transform/top'
import { entityTransform } from './transform/entity'
import { operationTransform } from './transform/operation'
import { fieldTransform } from './transform/field'
import { manualTransform } from './transform/manual'



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
  guide: Guide,
  tspec: TransformSpec,
  apimodel: any,
  def: any,
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
  field: fieldTransform,
  manual: manualTransform,
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
})

type Guide = ReturnType<typeof GuideShape>


async function resolveTransforms(ctx: TransformCtx): Promise<TransformSpec> {
  const { log, model: { main: { guide } } } = ctx

  // console.dir(api, { depth: null })

  const tspec: TransformSpec = {
    transform: []
  }

  // TODO: parameterize
  const defkind = 'openapi'
  const transformNames = guide.control.transform[defkind].order
    .split(/\s*,\s*/)
    .map((t: string) => t.trim())
    .filter((t: string) => '' != t)

  log.info({
    point: 'transform', note: 'order: ' + transformNames.join(';'),
    order: transformNames
  })

  for (const tn of transformNames) {
    log.debug({ what: 'transform', transform: tn, note: tn })
    const transform = await resolveTransform(tn, ctx)
    tspec.transform.push(transform)
  }

  // console.log('TSPEC', tspec)
  return tspec
}


async function resolveTransform(tn: string, ctx: TransformCtx) {
  const { log, defpath, model: { guide } } = ctx

  let transform = TRANSFORM[tn]
  if (transform) {
    // console.log('resolveTransform', tn, transform)
    return transform
  }

  const tdef = guide.transform[tn]
  if (null == tdef) {
    const err = new Error('Unknown transform: ' + tn)
    log.error({ what: 'transform', transform: tn, fail: 'unknown', err })
    throw err
  }

  if (!tn.startsWith('custom')) {
    const err =
      new Error('Custom transform name must start with "custom": ' + tn)
    log.error({ what: 'transform', transform: tn, fail: 'prefix', err })
    throw err
  }

  const customtpath = Path.join(defpath, tdef.load)
  try {
    const transformModule = require(customtpath)
    transform = transformModule[tn]
  }
  catch (e: any) {
    const err = new Error('Custom transform not found: ' +
      customtpath + ': ' + e.message)
    log.error({ what: 'transform', transform: tn, fail: 'require', err })
    throw err
  }

  return transform
}



async function processTransforms(
  ctx: TransformCtx,
  spec: TransformSpec,
  apimodel: any,
  def: any
): Promise<ProcessResult> {
  const pres: ProcessResult = {
    ok: true,
    msg: '',
    results: []
  }

  const guide: Guide = GuideShape(ctx.model.main.guide)


  for (let tI = 0; tI < spec.transform.length; tI++) {
    const transform = spec.transform[tI]

    try {
      const tres = await transform(ctx, guide, spec, apimodel, def)
      pres.ok = pres.ok && tres.ok
      pres.results.push(tres)
    }
    catch (err: any) {
      pres.ok = false
      pres.msg += transform.name + ': ' + err.message + '\n'
      pres.results.push({
        ok: false,
        msg: err.message,
        err,
        transform
      })
    }
  }

  return pres
}



function fixName(base: any, name: string, prop = 'name') {
  base[prop.toLowerCase()] = name.toLowerCase()
  base[camelify(prop)] = camelify(name)
  base[prop.toUpperCase()] = name.toUpperCase()
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
  resolveTransforms,
  processTransforms,
}
