
import type { TransformResult, Transform } from '../transform'
import { KIT } from '../types'

import { walk, isempty, isnode, ismap, islist } from '@voxgig/struct'


const cleanTransform: Transform = async function(
  ctx: any,
): Promise<TransformResult> {
  const { apimodel } = ctx

  let cur: any[] = []

  // Remove empty nodes and undefined values. This avoids spurious content in model.
  // NOTE: including ancestors if thus also empty!
  walk(
    apimodel,
    (k: any, v: any, _p: any, ancestors: any) => {
      if (undefined === k) {
        cur[ancestors.length] = ismap(v) ? {} : islist(v) ? [] : v
        return v
      }

      let vi = v

      if (isnode(v)) {
        if (isempty(v)) {
          vi = undefined
        }
        else {
          vi = cur[ancestors.length] = ismap(v) ? {} : []
        }

      }

      if (undefined !== vi && !k.endsWith('$')) {
        cur[ancestors.length - 1][k] = vi
      }

      return v
    },

    (k: any, v: any, _p: any, ancestors: any) => {
      const pi = cur[ancestors.length - 1]
      if (undefined !== pi) {
        const vi = pi[k]
        if (isnode(vi) && isempty(vi)) {
          delete pi[k]
        }
      }
      return v
    }
  )

  ctx.apimodel = cur[0]

  for (const entity of Object.values(ctx.apimodel.main?.[KIT]?.entity ?? {}) as any[]) {
    entity.fields ??= {}
  }

  return { ok: true, msg: 'clean' }
}


export {
  cleanTransform
}
