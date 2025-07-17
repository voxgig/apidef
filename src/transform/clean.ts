
import { each, getx } from 'jostraca'

import type { TransformResult } from '../transform'

import { walk } from '@voxgig/struct'



const cleanTransform = async function(
  ctx: any,
): Promise<TransformResult> {
  const { apimodel } = ctx

  walk(apimodel, (k: any, v: any) => {
    if ('string' === typeof k && k.includes('$')) {
      return undefined
    }
    return v
  })

  return { ok: true, msg: 'clean' }
}


export {
  cleanTransform
}
