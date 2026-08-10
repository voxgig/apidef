

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
  ModelPoint,
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
      each(mop.points, (mpoint: ModelPoint) => {
        // GraphQL defs have no `paths`; the lookup is only passed through to
        // an unused parameter, so skip it rather than dereference undefined.
        const pdef: PathDef = def.paths?.[mpoint.orig]
        resolveSelect(guide, ment, mop, mpoint, pdef)
      })
      if (null != mop.points && 0 < mop.points.length) {
        sortPoints(guide, ment, mop)
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
  mpoint: ModelPoint,
  _pdef: PathDef
) {
  const select: any = mpoint.select
  const margs: any = mpoint.args

  const argkinds = ['params', 'query', 'header', 'cookie']

  // `exist` names values that must be PRESENT for this point to be chosen.
  // A GraphQL root field exposes its optional arguments (relay's first /
  // after, filters) as params, and requiring those for selection would make
  // list() unusable without supplying every pagination argument. Only
  // required arguments identify a point.
  const reqdonly = 'graphql' === (mpoint as any).kind

  argkinds.map((kind: string) => {
    each(margs[kind], (marg: ModelArg) => {
      if (reqdonly && !marg.reqd) {
        return
      }
      if (!select.exist.includes(marg.name)) {
        select.exist.push(marg.name)
      }
    })
  })

  select.exist.sort()

  const gent = guide.entity[ment.name]
  // REST guides key entries by path, GraphQL guides by root field.
  const gpath = gent.path?.[mpoint.orig] ?? (gent as any).field?.[mpoint.orig]

  if (null == gpath) {
    return
  }

  if (gpath.action) {
    const actname = Object.keys(gpath.action).sort()[0]

    if (null != actname) {
      select.$action = actname
    }
  }

}


function sortPoints(
  _guide: Guide,
  _ment: ModelEntity,
  mop: ModelOp,
) {
  // Cache joined exist strings to avoid recomputing on every comparison.
  const existCache = new Map<ModelPoint, string>()
  for (const pt of mop.points) {
    existCache.set(pt, pt.select.exist.join('\t'))
  }

  mop.points.sort((a: ModelPoint, b: ModelPoint) => {
    // longest exist len first
    let order = b.select.exist.length - a.select.exist.length
    if (0 === order) {
      if (null != a.select.$action && null != b.select.$action) {
        order = a.select.$action < b.select.$action ? -1 :
          a.select.$action > b.select.$action ? 1 : 0
      }

      if (0 === order) {
        const a_exist_str = existCache.get(a)!
        const b_exist_str = existCache.get(b)!
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
