

import { each, snakify } from 'jostraca'

import { getelem } from '@voxgig/struct'

import type { TransformResult, Transform } from '../transform'

import { fixName } from '../transform'

import { formatJSONIC } from '../utility'


import type {
  GuideEntity,
  GuidePath,
  GuideOp,
  PathDesc,
  ModelOpMap,
  ModelOp,
  OpName,
} from './top'




/*
type AltDesc = {
  orig: string
  parts: string[]
  select: { param: Record<string, boolean> }
}

type OpDesc = {
  name: string
  alt: AltDesc[]
}

type OpMap = {
  load: undefined | OpDesc,
  list: undefined | OpDesc,
  create: undefined | OpDesc,
  update: undefined | OpDesc,
  patch: undefined | OpDesc,
  delete: undefined | OpDesc,
}
*/



const operationTransform: Transform = async function(
  ctx: any,
): Promise<TransformResult> {
  const { apimodel, guide } = ctx

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

    // console.log(entname, formatJSONIC(gent, { $: true }))

    resolveLoad(opm, gent)
    resolveList(opm, gent)
    resolveCreate(opm, gent)
    resolveUpdate(opm, gent)
    resolveDelete(opm, gent)
    resolvePatch(opm, gent)


    // per path add select:param:name = false for params from other paths
    // updateSelect(opm)

    // console.log('OPM', entname, formatJSONIC(opm))

    apimodel.main.sdk.entity[entname].op = opm

    msg += gent.name + ' '
  })

  console.log('=== operationTransform ===')
  console.log(formatJSONIC(apimodel.main.sdk.entity))


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
  let opdsec = gent.opm$[opname]
  if (opdsec) {
    mop = {
      name: opname,
      alts: opdsec.paths.map(p => {
        const parts = applyRename(p)

        return {
          orig: p.orig,
          parts,
          method: p.method,
          select: {
            param: parts
              .filter(p => '{' === p[0])
              .map(p => p.substring(1, p.length - 1))
              .reduce((a, p) => (a[p] = true, a),
                ('{id}' === getelem(parts, -2) ? {
                  $action: getelem(parts, -1)
                } : {}) as any)
          },
        }
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
