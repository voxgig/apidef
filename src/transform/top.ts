
import { each, getx } from 'jostraca'

import type { TransformResult } from '../transform'

import { fixName } from '../transform'


const topTransform = async function(
  ctx: any,
  // guide: Guide,
  // // tspec: TransformSpec,
  // model: any,
  // def: any
): Promise<TransformResult> {
  const { apimodel, def } = ctx

  // const { spec } = ctx

  apimodel.main.def.info = def.info
  apimodel.main.def.servers = def.servers

  return { ok: true, msg: 'top' }
}


export {
  topTransform
}
