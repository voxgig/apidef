import { guideActive } from '../utility'


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



// The op names the transform resolves. Anything else under a guide path's
// `op` map is dropped, and an unknown name (a verb such as `merge`, or a
// typo) is dropped WITH A WARNING: guide.aon is the only correction surface
// (ADR-002), so a correction that vanishes silently defeats it. A non-CRUD
// verb is declared as `action: <verb>: {}` beside a CRUD op on the same path.
const RESOLVED_OPS = ['load', 'list', 'create', 'update', 'remove', 'patch']

// Emitted by the heuristic for HEAD and OPTIONS methods; no SDK operation
// exists for them yet, so they are skipped without a warning.
const IGNORED_OPS = ['head', 'options', 'OPTIONS']


const operationTransform: Transform = async function(
  ctx: any,
): Promise<TransformResult> {
  const { apimodel, guide } = ctx
  const kit = apimodel.main[KIT]

  let msg = 'operation '

  each(guide.entity, (gent: GuideEntity, entname: string) => {
    if (!guideActive(gent)) return

    collectOps(ctx, gent)

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


function collectOps(ctx: any, gent: GuideEntity) {
  ; (gent as any).opm$ = (gent as any).opm$ ?? {}
  each((gent as any).paths$, (pathdesc: PathDesc) => {
    each(pathdesc.op, (gop: GuidePathOp, opname: OpName) => {
      // Op-level opt-out; see the entity-level note in transform/entity.ts.
      if (!guideActive(gop)) {
        return
      }

      if (!RESOLVED_OPS.includes(opname)) {
        if (!IGNORED_OPS.includes(opname)) {
          ctx.warn?.({
            note: `Unknown op "${opname}" on entity=${gent.name} path=${pathdesc.orig}` +
              ` is dropped: only ${RESOLVED_OPS.join('/')} are resolved.` +
              ` Declare a verb as \`action: ${opname}: {}\` beside a CRUD op on that path.`,
            entity: gent.name,
            path: pathdesc.orig,
            op: opname,
          })
        }
        return
      }

      ; (gent as any).opm$[opname] = (gent as any).opm$[opname] ?? { paths: [] }

      const oppathdesc: PathDesc = {
        orig: pathdesc.orig,
        segments: pathdesc.segments,
        rename: pathdesc.rename,
        method: gop.method as any,
        op: gop as any,
        action: pathdesc.action,
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
  //
  // That holds when there is no PUT update at all, and equally when every
  // PUT update point is an ACTION: a verb such as GitHub's `merge` borrows
  // the update slot (actions have no slot of their own) but is not the
  // entity's update. Leaving PATCH as `patch` there made the real update
  // unreachable, since no target emits a `patch` method, and routed a plain
  // update() to the verb. The action points join the promoted PATCH, and
  // `$action` selects them at call time.
  if (null != opdesc && (null == opm.update || onlyActionPaths(gent, 'update'))) {
    if (null != opm.update) {
      opdesc.points.push(...opm.update.points)
    }
    opm.update = opdesc
    opm.update.name = 'update'
  }
  else {
    opm.patch = opdesc
  }

  return opdesc
}


// True when every path collected under the op carries a guide action.
function onlyActionPaths(gent: GuideEntity, opname: OpName): boolean {
  const paths: PathDesc[] = (gent as any).opm$?.[opname]?.paths ?? []
  return 0 < paths.length &&
    paths.every((p: PathDesc) => 0 < Object.keys(p.action ?? {}).length)
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
        const segments = p.segments

        const mpoint: ModelPoint = {
          orig: p.orig,
          segments,
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
