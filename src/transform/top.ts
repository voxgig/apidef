
import { each, getx } from 'jostraca'

import type { TransformCtx, TransformSpec } from '../transform'

import { fixName } from '../transform'


async function topTransform(ctx: TransformCtx, tspec: TransformSpec, model: any, def: any) {
  const { spec } = ctx

  model.main.def.info = def.info
  model.main.def.servers = def.servers

  return { ok: true, msg: 'top' }
}


export {
  topTransform
}
