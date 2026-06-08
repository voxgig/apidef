

import { each } from 'jostraca'

import type { TransformResult, Transform } from '../transform'


import {
  KIT,
  GuideEntity,
  GuidePathOp,
} from '../types'

import type {
  PathDesc,
} from '../desc'

import type {
  OpName,
  ModelOpMap,
  ModelOp,
  ModelPoint,
} from '../model'



const operationTransform: Transform = async function(
  ctx: any,
): Promise<TransformResult> {
  const { apimodel, guide } = ctx
  const kit = apimodel.main[KIT]

  let msg = 'operation '

  each(guide.entity, (gent: GuideEntity, entname: string) => {
    collectOps(gent)

    const opm: ModelOpMap = {
      load: undefined,
      list: undefined,
      create: undefined,
      update: undefined,
      remove: undefined,
      patch: undefined,
    }

    resolveLoad(opm, gent)
    resolveList(opm, gent)
    resolveCreate(opm, gent)
    resolveUpdate(opm, gent)
    resolveRemove(opm, gent)
    resolvePatch(opm, gent)

    kit.entity[entname].op = opm

    msg += gent.name + ' '
  })

  return { ok: true, msg }
}


function collectOps(gent: GuideEntity) {
  ; (gent as any).opm$ = (gent as any).opm$ ?? {}
  each((gent as any).paths$, (pathdesc: PathDesc) => {
    each(pathdesc.op, (gop: GuidePathOp, opname: OpName) => {
      ; (gent as any).opm$[opname] = (gent as any).opm$[opname] ?? { paths: [] }

      const oppathdesc: PathDesc = {
        orig: pathdesc.orig,
        parts: pathdesc.parts,
        rename: pathdesc.rename,
        method: gop.method as any,
        op: gop as any,
        def: pathdesc.def,
      }

        ; (gent as any).opm$[opname].paths.push(oppathdesc)
    })
  })
}





function resolveLoad(opm: ModelOpMap, gent: GuideEntity): undefined | ModelOp {
  const opdesc = opm.load = resolveOp('load', gent)
  return opdesc
}


function resolveList(opm: ModelOpMap, gent: GuideEntity): undefined | ModelOp {
  const opdesc = opm.list = resolveOp('list', gent)
  return opdesc
}


function resolveCreate(opm: ModelOpMap, gent: GuideEntity): undefined | ModelOp {
  const opdesc = opm.create = resolveOp('create', gent)
  return opdesc
}


function resolveUpdate(opm: ModelOpMap, gent: GuideEntity): undefined | ModelOp {
  const opdesc = opm.update = resolveOp('update', gent)
  return opdesc
}


function resolveRemove(opm: ModelOpMap, gent: GuideEntity): undefined | ModelOp {
  const opdesc = opm.remove = resolveOp('remove', gent)
  return opdesc
}


function resolvePatch(opm: ModelOpMap, gent: GuideEntity): undefined | ModelOp {
  const opdesc = resolveOp('patch', gent)

  // If patch is actually update, make it update!
  if (null != opdesc && null == opm.update) {
    opm.update = opdesc
    opm.update.name = 'update'
  }
  else {
    opm.patch = opdesc
  }

  return opdesc
}


function resolveOp(opname: OpName, gent: GuideEntity): undefined | ModelOp {
  let mop: undefined | ModelOp = undefined
  let opdesc = (gent as any).opm$[opname]
  if (opdesc) {
    mop = {
      name: opname,
      points: opdesc.paths.map((p: PathDesc) => {
        // Renames already applied by entity.ts resolvePathList — re-applying
        // here corrupted paths for any spec where rename map maps an old
        // name to a value that another rename maps to a different new name
        // (e.g. gitlab `/groups/{id}/badges/{badge_id}` with rename
        // `{badge_id: 'id', id: 'project_id'}` ended up as
        // `/groups/{project_id}/badges/{project_id}` — the second pass
        // rewrote the freshly-renamed `{id}` into `{project_id}` again).
        const parts = p.parts

        const mpoint: ModelPoint = {
          orig: p.orig,
          parts,
          rename: p.rename,
          method: p.method,
          args: {},
          // Carry the per-path op transform (res `body.<entity>`, req
          // `{<entity>: reqdata}`) computed by the guide step
          // (heuristic01 ResolveTransform) onto the point. It lives on the
          // path's op, not on the op-map entry, so read p.op.transform.
          // Spread into a fresh object so the default-fill below never
          // mutates the shared guide op.transform across points.
          transform: { ...((p as any).op?.transform ?? {}) },
          select: {
            exist: []
          }
        }

        mpoint.transform.req = mpoint.transform.req ?? '`reqdata`'
        mpoint.transform.res = mpoint.transform.res ?? '`body`'

        return mpoint
      })
    }
  }
  return mop
}




export {
  operationTransform,
}
