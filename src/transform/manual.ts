
import { Jsonic } from '@jsonic/jsonic-next'

import { each, getx } from 'jostraca'

import type { TransformCtx, TransformSpec } from '../transform'


const { deep } = Jsonic.util

async function manualTransform(ctx: TransformCtx, tspec: TransformSpec, model: any, def: any) {
  const { guide: { guide: { manual } } } = ctx

  deep(model, manual)

  return { ok: true }
}


export {
  manualTransform
}
