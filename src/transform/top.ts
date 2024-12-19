
import { each, getx } from 'jostraca'

import type { TransformCtx, TransformSpec, TransformResult, Transform, Guide } from '../transform'

import { fixName } from '../transform'


const topTransform = async function(
  ctx: TransformCtx,
  guide: Guide,
  tspec: TransformSpec,
  model: any,
  def: any
): Promise<TransformResult> {
  const { spec } = ctx

  model.main.def.info = def.info
  model.main.def.servers = def.servers

  return { ok: true, msg: 'top' }
}


export {
  topTransform
}
