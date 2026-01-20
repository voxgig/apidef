
import { joinurl } from '@voxgig/struct'

import { KIT } from '../types'

import type { TransformResult } from '../transform'

import type {
  KitModel,
} from '../types'

import type {
  // GuidePath,
  PathDesc,
  OpDesc,
} from '../desc'

import type {
  OpName,
} from '../model'


// Guide* => from guide model
// *Desc => internal working descriptiuon
// *Def => API spec definition
// Model* => Generated SDK Model


// type GuideEntity = {
//   name: string,
//   path: Record<string, GuidePath>

//   paths$: PathDesc[]
//   opm$: Record<OpName, OpDesc>
// }


const topTransform = async function(
  ctx: any,
): Promise<TransformResult> {
  const { apimodel, def } = ctx
  const kit: KitModel = apimodel.main[KIT]

  kit.info = def.info
  kit.info.servers = def.servers ?? []

  // Swagger 2.0
  if (def.host) {
    kit.info.servers.push({
      url: (def.schemes?.[0] ?? 'https') + '://' + joinurl([def.host, def.basePath])
    })
  }

  return { ok: true, msg: 'top' }
}


export {
  topTransform
}


// export type {
//   GuideEntity,
// }
