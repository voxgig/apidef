
import { each, getx } from 'jostraca'

import { joinurl } from '@voxgig/struct'

import type { TransformResult } from '../transform'

import { fixName } from '../transform'


const topTransform = async function(
  ctx: any,
): Promise<TransformResult> {
  const { apimodel, def } = ctx

  apimodel.main.def.info = def.info
  apimodel.main.def.servers = def.servers ?? []

  // Swagger 2.0
  if (def.host) {
    apimodel.main.def.servers.push({
      url: (def.schemes?.[0] ?? 'https') + '://' + joinurl([def.host, def.basePath])
    })
  }

  return { ok: true, msg: 'top' }
}


export {
  topTransform
}
