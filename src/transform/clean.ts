
import type { TransformResult } from '../transform'

import { walk, isempty, isnode, ismap, islist } from '@voxgig/struct'

import { formatJSONIC } from '../utility'


const cleanTransform = async function(
  ctx: any,
): Promise<TransformResult> {
  const { apimodel } = ctx

  let cur: any[] = []

  // Remove empty nodes and undefined values
  walk(
    apimodel,
    (k: any, v: any, _p: any, t: any) => {
      if (undefined === k) {
        cur[t.length] = ismap(v) ? {} : islist(v) ? [] : v
        return v
      }

      let vi = v

      if (isnode(v)) {
        if (isempty(v)) {
          vi = undefined
        }
        else {
          vi = cur[t.length] = ismap(v) ? {} : []
        }

      }

      if (undefined !== vi && !k.endsWith('$')) {
        cur[t.length - 1][k] = vi
      }

      return v
    },
    (k: any, _v: any, _p: any, t: any) => {
      const pi = cur[t.length - 1]
      if (undefined !== pi) {
        const vi = pi[k]
        if (isnode(vi) && isempty(vi)) {
          delete pi[k]
        }
      }
    }
  )

  ctx.apimodel = cur[0]

  return { ok: true, msg: 'clean' }
}


export {
  cleanTransform
}
