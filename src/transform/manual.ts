
import { Jsonic } from 'jsonic'

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

  const { manual } = guide

  deep(model, manual)

  return { ok: true, msg: 'manual' }
}


export {
  manualTransform
}
