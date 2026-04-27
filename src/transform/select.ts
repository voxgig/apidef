

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
  ModelTarget,
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
      each(mop.points, (mtarget: ModelTarget) => {
        const pdef: PathDef = def.paths[mtarget.orig]
        resolveSelect(guide, ment, mop, mtarget, pdef)
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
  mtarget: ModelTarget,
  _pdef: PathDef
) {
  const select: any = mtarget.select
  const margs: any = mtarget.args

  const argkinds = ['params', 'query', 'header', 'cookie']

  argkinds.map((kind: string) => {
    each(margs[kind], (marg: ModelArg) => {
      if (!select.exist.includes(marg.name)) {
        select.exist.push(marg.name)
      }
    })
  })

  select.exist.sort()

  const gent = guide.entity[ment.name]
  const gpath = gent.path[mtarget.orig]

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
  const existCache = new Map<ModelTarget, string>()
  for (const pt of mop.points) {
    existCache.set(pt, pt.select.exist.join('\t'))
  }

  mop.points.sort((a: ModelTarget, b: ModelTarget) => {
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
