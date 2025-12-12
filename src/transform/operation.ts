

import { each, snakify } from 'jostraca'

import { getelem, isempty } from '@voxgig/struct'

import type { TransformResult, Transform } from '../transform'

import { fixName } from '../transform'

import { formatJSONIC } from '../utility'

import { KIT } from '../types'

import type { KitModel } from '../types'

import type {
  GuideEntity,
} from './top'

import type {
  GuideOp,
  PathDesc,
} from '../desc'

import type {
  OpName,
  ModelOpMap,
  ModelOp,
  ModelAlt,
} from '../model'



const operationTransform = async function(
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
      delete: undefined,
      patch: undefined,
    }

    resolveLoad(opm, gent)
    resolveList(opm, gent)
    resolveCreate(opm, gent)
    resolveUpdate(opm, gent)
    resolveDelete(opm, gent)
    resolvePatch(opm, gent)

    kit.entity[entname].op = opm

    msg += gent.name + ' '
  })

  return { ok: true, msg }
}


function collectOps(gent: GuideEntity) {
  gent.opm$ = gent.opm$ ?? {}
  each(gent.paths$, (pathdesc: PathDesc) => {
    each(pathdesc.op, (gop: GuideOp, opname: OpName) => {
      gent.opm$[opname] = gent.opm$[opname] ?? { paths: [] }

      const oppathdesc: PathDesc = {
        orig: pathdesc.orig,
        parts: pathdesc.parts,
        rename: pathdesc.rename,
        method: gop.method,
        op: pathdesc.op,
        def: pathdesc.def,
      }

      gent.opm$[opname].paths.push(oppathdesc)
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


function resolveDelete(opm: ModelOpMap, gent: GuideEntity): undefined | ModelOp {
  const opdesc = opm.delete = resolveOp('delete', gent)
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
  let opdesc = gent.opm$[opname]
  if (opdesc) {
    // console.dir(opdesc, { depth: null })

    mop = {
      name: opname,
      alts: opdesc.paths.map(p => {
        const parts = applyRename(p)

        const malt: ModelAlt = {
          orig: p.orig,
          parts,
          method: p.method,
          args: {},
          select: {}
        }

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
