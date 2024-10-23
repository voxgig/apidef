
import { each, getx } from 'jostraca'

import type { TransformCtx, TransformSpec } from '../transform'

import { fixName } from '../transform'


async function topTransform(ctx: TransformCtx, tspec: TransformSpec, model: any, def: any) {
  const { spec } = ctx

  fixName(model.main.api, spec.meta.name)
  model.main.def.desc = def.info.description

  return { ok: true }
}


export {
  topTransform
}
