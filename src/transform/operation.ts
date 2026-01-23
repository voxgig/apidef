

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
  ModelAlt,
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
  console.log('RD', (gent as any).opm$)
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
    // console.dir(opdesc, { depth: null })

    mop = {
      name: opname,
      alts: opdesc.paths.map((p: PathDesc) => {
        const parts = applyRename(p)

        const malt: ModelAlt = {
          orig: p.orig,
          parts,
          rename: p.rename,
          method: p.method,
          args: {},
          transform: opdesc.transform ?? {},
          select: {
            exist: []
          }
        }

        malt.transform.req = malt.transform.req ?? '`reqdata`'
        malt.transform.res = malt.transform.res ?? '`body`'

        return malt
      })
    }
  }
  return mop
}


function applyRename(pathdesc: PathDesc): string[] {
  const prn: Record<string, string> = pathdesc.rename?.param ?? {}
  return pathdesc.parts.map(p => '{' === p[0] ? (prn[p.substring(1, p.length - 1)] ?? p) : p)
}




export {
  operationTransform,
}
