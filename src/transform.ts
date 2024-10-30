/* Copyright (c) 2024 Voxgig, MIT License */


import Path from 'node:path'

import { getx, each, camelify } from 'jostraca'


import { topTransform } from './transform/top'
import { entityTransform } from './transform/entity'
import { operationTransform } from './transform/operation'
import { fieldTransform } from './transform/field'
import { manualTransform } from './transform/manual'



type TransformCtx = {
  log: any,
  spec: any,
  guide: any,
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
}

type Transform = (
  ctx: TransformCtx,
  tspec: TransformSpec,
  model: any,
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




async function resolveTransforms(ctx: TransformCtx): Promise<TransformSpec> {
  const { log, guide: { guide } } = ctx

  const tspec: TransformSpec = {
    transform: []
  }

  // TODO: parameterize
  const defkind = 'openapi'
  const transformNames = guide.control.transform[defkind].order
    .split(/\s*,\s*/)
    .map((t: string) => t.trim())
    .filter((t: string) => '' != t)

  log.info({ point: 'transform', note: 'order', order: transformNames })

  for (const tn of transformNames) {
    log.debug({ what: 'transform', transform: tn })
    const transform = await resolveTransform(tn, ctx)
    tspec.transform.push(transform)
  }

  return tspec
}


async function resolveTransform(tn: string, ctx: TransformCtx) {
  const { log, defpath, guide: { guide } } = ctx

  let transform = TRANSFORM[tn]
  if (transform) {
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
  model: any,
  def: any
): Promise<ProcessResult> {
  const pres: ProcessResult = {
    ok: true,
    msg: '',
    results: []
  }

  for (let tI = 0; tI < spec.transform.length; tI++) {
    const transform = spec.transform[tI]

    try {
      const tres = await transform(ctx, spec, model, def)
      pres.ok = pres.ok && tres.ok
      pres.msg += tres.msg + '\n'
      pres.results.push(tres)
    }
    catch (err: any) {
      pres.ok = false
      pres.msg += err.message + '\n'
      pres.results.push({
        ok: false,
        msg: err.message
      })
    }
  }

  return pres
}





/*
function extractFields(properties: any) {
  const fieldMap = each(properties)
    .reduce((a: any, p: any) => (a[p.key$] =
      { name: p.key$, kind: camelify(p.type) }, a), {})
  return fieldMap
}
*/


function fixName(base: any, name: string, prop = 'name') {
  base[prop.toLowerCase()] = name.toLowerCase()
  base[camelify(prop)] = camelify(name)
  base[prop.toUpperCase()] = name.toUpperCase()
}





export type {
  TransformCtx,
  TransformSpec,
}


export {
  fixName,
  resolveTransforms,
  processTransforms,
}
