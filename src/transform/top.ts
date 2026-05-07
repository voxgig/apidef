
import { join } from '@voxgig/struct'

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

  kit.info = stringifyInfoScalars(def.info ?? {})
  kit.info.servers = stringifyInfoScalars(def.servers ?? [])

  // Swagger 2.0
  if (def.host) {
    kit.info.servers.push({
      url: (def.schemes?.[0] ?? 'https') + '://' + join([def.host, def.basePath], '/', true)
    })
  }

  return { ok: true, msg: 'top' }
}


// OpenAPI's `info` object (and the `servers` array) declares every scalar
// leaf as a string. YAML/JSON parsers don't enforce that — `version: 2`
// without quotes parses as the number 2, `version: true` as a boolean.
// Apidef's downstream schema (apidef.jsonic) unifies info fields as
// `string`, so non-string scalars cause an aontu unify failure during
// model resolution. Normalise scalar leaves to strings here, at the
// model-build boundary, rather than relax the schema.
function stringifyInfoScalars(node: any): any {
  if (null == node) return node
  if (Array.isArray(node)) return node.map(stringifyInfoScalars)
  if ('object' === typeof node) {
    const out: Record<string, any> = {}
    for (const [k, v] of Object.entries(node)) {
      out[k] = stringifyInfoScalars(v)
    }
    return out
  }
  if ('number' === typeof node || 'boolean' === typeof node) {
    return String(node)
  }
  return node
}


export {
  topTransform
}


// export type {
//   GuideEntity,
// }
