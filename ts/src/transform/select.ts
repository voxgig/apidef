

import { each } from 'jostraca'

import type { TransformResult, Transform } from '../transform'


import { KIT } from '../types'

import { arrayRequestField } from './body'

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
        // GraphQL defs have no `paths`, so their points get no path def.
        const pdef: PathDef = def.paths?.[mpoint.o]
        resolveSelect(guide, ment, mop, mpoint, pdef)
      })
      if (null != mop.points && 0 < mop.points.length) {
        sortPoints(guide, ment, mop)
        warnSharedSelectors(ctx, ment, mop)
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
  pdef: PathDef
) {
  const select: any = mpoint.q
  const margs: any = mpoint.g

  const argkinds = ['params', 'query', 'header', 'cookie']

  // `exist` names values that must be PRESENT for this point to be chosen,
  // so an optional argument would make the point unreachable to a caller
  // who omits it. A path parameter fills the route and always counts; a
  // GraphQL root field's arguments are params too, and count only when
  // required.
  const graphql = 'graphql' === (mpoint as any).k

  argkinds.map((kind: string) => {
    each(margs[kind], (marg: ModelArg) => {
      if (!marg.r && (graphql || 'params' !== kind)) {
        return
      }
      if (!select.exist.includes(marg.n)) {
        select.exist.push(marg.n)
      }
    })
  })

  const listfield = arrayRequestField(
    (pdef as any)?.[String(mpoint.m).toLowerCase()], mpoint.t?.req)
  if (null != listfield && !select.exist.includes(listfield)) {
    select.exist.push(listfield)
  }

  select.exist.sort()

  const gent = guide.entity[ment.name]
  // REST guides key entries by path, GraphQL guides by root field.
  const gpath = gent.path?.[mpoint.o] ?? (gent as any).field?.[mpoint.o]

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
    existCache.set(pt, pt.q.exist.join('\t'))
  }

  mop.points.sort((a: ModelPoint, b: ModelPoint) => {
    // longest exist len first
    let order = b.q.exist.length - a.q.exist.length
    if (0 === order) {
      if (null != a.q.$action && null != b.q.$action) {
        order = a.q.$action < b.q.$action ? -1 :
          a.q.$action > b.q.$action ? 1 : 0
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

// The first point whose selector matches is chosen, so of the points that
// share a selector only the first is ever reached.
function warnSharedSelectors(ctx: any, ment: ModelEntity, mop: ModelOp) {
  const groups = new Map<string, ModelPoint[]>()
  for (const mpoint of mop.points) {
    const key = JSON.stringify([mpoint.q.$action ?? null, mpoint.q.exist])
    groups.set(key, [...(groups.get(key) ?? []), mpoint])
  }

  for (const group of groups.values()) {
    if (group.length < 2) continue
    const points = group.map((mpoint) => mpoint.m + ' ' + mpoint.o)
    const { exist, $action } = group[0].q
    ctx.warn?.({
      note: `Points ${points.slice(0, -1).join(', ')} and ${points[points.length - 1]}` +
        ` on entity=${ment.name} op=${mop.name} have the same selector` +
        ` (exist: ${exist.join(',') || 'none'}` +
        (null == $action ? '' : `; $action: ${$action}`) +
        `), so only ${points[0]} is ever chosen.` +
        ' An action or another entity in guide.aontu tells them apart.',
      entity: ment.name,
      op: mop.name,
      points,
    })
  }
}


export {
  selectTransform,
}
