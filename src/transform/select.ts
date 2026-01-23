

import { each } from 'jostraca'

import type { TransformResult, Transform } from '../transform'


import { KIT } from '../types'

import type {
  KitModel,
  Guide,
} from '../types'

import type {
  PathDef,
} from '../def'

import type {
  OpName,
  ModelOp,
  ModelEntity,
  ModelAlt,
  ModelArg,
} from '../model'



const selectTransform: Transform = async function(
  ctx: any,
): Promise<TransformResult> {
  const { apimodel, def, guide } = ctx
  const kit: KitModel = apimodel.main[KIT]

  let msg = 'select '

  each(kit.entity, (ment: ModelEntity, _entname: string) => {
    each(ment.op, (mop: ModelOp, _opname: OpName) => {
      each(mop.alts, (malt: ModelAlt) => {
        const pdef: PathDef = def.paths[malt.orig]
        resolveSelect(guide, ment, mop, malt, pdef)
      })
      if (null != mop.alts && 0 < mop.alts.length) {
        sortAlts(guide, ment, mop)
      }
    })

    msg += ment.name + ' '
  })

  return { ok: true, msg }
}


function resolveSelect(
  guide: Guide,
  ment: ModelEntity,
  _mop: ModelOp,
  malt: ModelAlt,
  _pdef: PathDef
) {
  const select: any = malt.select
  const margs: any = malt.args

  const argkinds = ['param', 'query', 'header', 'cookie']

  argkinds.map((kind: string) => {
    each(margs[kind], (marg: ModelArg) => {
      if (!select.exist.includes(marg.name)) {
        select.exist.push(marg.name)
      }
    })
  })

  select.exist.sort()

  const gent = guide.entity[ment.name]
  const gpath = gent.path[malt.orig]

  if (gpath.action) {
    const actname = Object.keys(gpath.action)[0]

    if (null != actname) {
      select.$action = actname
    }
  }

}


function sortAlts(
  _guide: Guide,
  _ment: ModelEntity,
  mop: ModelOp,
) {
  mop.alts.sort((a: ModelAlt, b: ModelAlt) => {
    // longest exist len first
    let order = b.select.exist.length - a.select.exist.length
    if (0 === order) {
      if (null != a.select.$action && null != b.select.$action) {
        order = a.select.$action < b.select.$action ? -1 :
          a.select.$action > b.select.$action ? 1 : 0
      }

      if (0 === order) {
        const a_exist_str = a.select.exist.join('\t')
        const b_exist_str = b.select.exist.join('\t')
        order = a_exist_str < b_exist_str ? -1 :
          a_exist_str > b_exist_str ? 1 : 0
      }
    }

    return order
  })
}

export {
  selectTransform,
}
