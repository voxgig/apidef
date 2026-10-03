import { bodyRequestTransform, guideActive } from '../utility'

import { arrayBodyField } from '../guide/heuristic01'

import {
  arrayCarrier, arrayRequestSchema, guideMedia, nullableType, requestSchema, sameType,
} from './body'

import { routeFieldNames } from './field'

import { routeArgNames } from './args'


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
  ModelEntity,
} from '../model'



// The op names the transform resolves. Anything else under a guide path's
// `op` map is dropped, and an unknown name (a verb such as `merge`, or a
// typo) is dropped WITH A WARNING: guide.aontu is the only correction surface
// (ADR-002), so a correction that vanishes silently defeats it. A non-CRUD
// verb is declared as `action: <verb>: {}` beside a CRUD op on the same path.
const RESOLVED_OPS = ['load', 'list', 'create', 'update', 'remove', 'patch']

// Emitted by the heuristic for HEAD and OPTIONS methods; no SDK operation
// exists for them yet, so they are skipped without a warning.
const IGNORED_OPS = ['head', 'options', 'OPTIONS']


const operationTransform: Transform = async function(
  ctx: any,
): Promise<TransformResult> {
  const { apimodel, def, guide } = ctx
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

    const on = { gent, def, entname, guide }
    resolveLoad(opm, on)
    resolveList(opm, on)
    resolveCreate(opm, on)
    resolveUpdate(opm, on)
    resolveRemove(opm, on)
    resolvePatch(opm, on)

    // After patch has joined update, so each operation's routes are final.
    for (const mop of Object.values(opm)) {
      for (const mpoint of mop?.points ?? []) {
        if (heuristicRequest(on, mop!, mpoint)) {
          mpoint.t.req = undefined
        }
        mpoint.t.req = mpoint.t.req ?? requestDefault(on, kit.entity[entname], opm, mop!, mpoint)
        mpoint.t.res = mpoint.t.res ?? '`body`'
      }
    }

    kit.entity[entname].op = opm

    msg += gent.name + ' '
  })

  return { ok: true, msg }
}


function collectOps(ctx: any, gent: GuideEntity) {
  ; (gent as any).opm$ = (gent as any).opm$ ?? {}
  each((gent as any).paths$, (pathdesc: PathDesc) => {
    each(pathdesc.op, (gop: GuidePathOp, opname: OpName) => {
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





function resolveLoad(opm: ModelOpMap, on: OpEntity): undefined | ModelOp {
  const opdesc = opm.load = resolveOp('load', on)
  return opdesc
}


function resolveList(opm: ModelOpMap, on: OpEntity): undefined | ModelOp {
  const opdesc = opm.list = resolveOp('list', on)
  return opdesc
}


function resolveCreate(opm: ModelOpMap, on: OpEntity): undefined | ModelOp {
  const opdesc = opm.create = resolveOp('create', on)
  return opdesc
}


function resolveUpdate(opm: ModelOpMap, on: OpEntity): undefined | ModelOp {
  const opdesc = opm.update = resolveOp('update', on)
  return opdesc
}


function resolveRemove(opm: ModelOpMap, on: OpEntity): undefined | ModelOp {
  const opdesc = opm.remove = resolveOp('remove', on)
  return opdesc
}


function resolvePatch(opm: ModelOpMap, on: OpEntity): undefined | ModelOp {
  const opdesc = resolveOp('patch', on)

  if (null != opdesc && (null == opm.update || onlyActionPaths(on.gent, 'update'))) {
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


type OpEntity = { gent: GuideEntity, def: any, entname: string, guide: any }


function resolveOp(opname: OpName, on: OpEntity): undefined | ModelOp {
  let mop: undefined | ModelOp = undefined
  let opdesc = (on.gent as any).opm$[opname]
  if (opdesc) {
    mop = {
      name: opname,
      points: opdesc.paths.map((p: PathDesc) => {
        const segments = p.segments

        const mpoint: ModelPoint = {
          o: p.orig,
          s: segments,
          r: p.rename,
          m: p.method,
          g: {},
          t: { ...((p as any).op?.transform ?? {}) },
          q: {
            exist: []
          }
        }

        return mpoint
      })
    }
  }
  return mop
}




// The request transform the heuristic took from the default body, still in
// place where the guide selects another media type for the point.
function heuristicRequest(on: OpEntity, mop: ModelOp, mpoint: ModelPoint): boolean {
  const chosen = guideMedia(on.guide, on.entname, mop.name, mpoint).body
  if (null == chosen || null == mpoint.t.req) return false
  const generated = bodyRequestTransform(requestSchema(on.def, mpoint.m, mpoint.o), [on.gent.name])
  return null != generated && sameTransform(mpoint.t.req, generated)
}


function sameTransform(a: any, b: any): boolean {
  const canon = (t: any) => 'string' === typeof t ? t :
    JSON.stringify(Object.keys(t ?? {}).sort().map((k: string) => [k, t[k]]))
  return canon(a) === canon(b)
}


// An array body is sent from one field of the request data, named for its
// records, and never for an argument of its operation, a field another route of
// its entity has, as fields span operations, or a carrier already named for an
// array of another type. Decided here, not by the guide heuristic, as the
// guide's media type decides the body.
function requestDefault(
  on: OpEntity, ment: ModelEntity, opm: ModelOpMap, mop: ModelOp, mpoint: ModelPoint,
): any {
  const media = (opname: string, q: ModelPoint) => guideMedia(on.guide, on.entname, opname, q).body
  const chosen = media(mop.name, mpoint)
  const list = arrayRequestSchema(on.def, mpoint.m, mpoint.o, chosen)
  if (null == list) {
    return (null == chosen ? undefined :
      bodyRequestTransform(requestSchema(on.def, mpoint.m, mpoint.o, chosen), [on.gent.name])) ?? '`reqdata`'
  }
  const others = mop.points.filter((q) => q !== mpoint)
  const routes = Object.values(opm).flatMap((op) =>
    (op?.points ?? []).filter((q) => q !== mpoint).map((q) => ({ opname: op!.name, q })))
  const taken = [
    ...mop.points.flatMap((q) => routeArgNames(on.def, q)),
    ...routes.flatMap(({ opname, q }) => routeFieldNames(ment, opname, q, on.def, media(opname, q))),
    ...others.map((q) => arrayCarrier(on.def, q, media(mop.name, q)))
      .filter((carrier) => null != carrier && !sameType(carrier.type, nullableType(list)))
      .map((carrier) => carrier!.name),
  ]
  return '`reqdata.' + arrayBodyField(list, on.entname, taken) + '`'
}


export {
  operationTransform,
}
