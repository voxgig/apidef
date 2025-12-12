

import { each, snakify } from 'jostraca'

import type { TransformResult, Transform } from '../transform'

import { formatJSONIC, depluralize, validator } from '../utility'


import { KIT } from '../types'

import type {
  KitModel,
  Guide,
} from '../types'

import type {
  PathDef,
  ParameterDef,
  MethodDef,
} from '../def'

import type {
  OpName,
  ModelOp,
  ModelEntity,
  ModelAlt,
  ModelArg,
} from '../model'



const selectTransform = async function(
  ctx: any,
): Promise<TransformResult> {
  const { apimodel, def, guide } = ctx
  const kit: KitModel = apimodel.main[KIT]

  let msg = 'select '

  each(kit.entity, (ment: ModelEntity, entname: string) => {
    each(ment.op, (mop: ModelOp, opname: OpName) => {
      each(mop.alts, (malt: ModelAlt) => {
        const pdef: PathDef = def.paths[malt.orig]
        resolveSelect(guide, ment, mop, malt, pdef)
      })
    })

    msg += ment.name + ' '
  })

  return { ok: true, msg }
}


function resolveSelect(guide: Guide, ment: ModelEntity, mop: ModelOp, malt: ModelAlt, pdef: PathDef) {
  const select: any = malt.select
  const margs: any = malt.args

  const argkinds = ['param', 'query', 'header', 'cookie']

  argkinds.map((kind: string) => {
    each(margs[kind], (marg: ModelArg) => {
      select[kind] = (select[kind] ?? {})

      if (marg.req) {
        select[kind][marg.name] = true
      }
    })
  })

  const gent = guide.entity[ment.name]
  const gpath = gent.path[malt.orig]

  // console.log('GPATH', gpath)

  if (gpath.action) {
    const actname = Object.keys(gpath.action)[0]

    if (null != actname) {
      select.$action = actname
    }
  }

}


export {
  selectTransform,
}
