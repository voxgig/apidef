
import { Jsonic } from '@jsonic/jsonic-next'

import { each, getx } from 'jostraca'

import type { TransformCtx, TransformSpec, TransformResult, Transform, Guide } from '../transform'


const { deep } = Jsonic.util

const manualTransform = async function(
  ctx: TransformCtx,
  guide: Guide,
  tspec: TransformSpec,
  model: any,
  def: any
): Promise<TransformResult> {

  const { model: { main: { guide: { manual } } } } = ctx

  deep(model, manual)

  return { ok: true, msg: 'manual' }
}


export {
  manualTransform
}
