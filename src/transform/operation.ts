

import { each, snakify } from 'jostraca'

import type { TransformResult, Transform } from '../transform'

import { fixName } from '../transform'

import { formatJSONIC } from '../utility'


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



const operationTransform: Transform = async function(
  ctx: any,
): Promise<TransformResult> {
  const { apimodel, guide } = ctx

  let msg = 'operation '

  each(guide.entity, (gent: any, entname: string) => {
    const opm: OpMap = {
      load: undefined,
      list: undefined,
      create: undefined,
      update: undefined,
      delete: undefined,
      patch: undefined,
    }

    collectOps(gent)
    // console.log(entname, formatJSONIC(gent, { $: true }))

    resolveLoad(opm, gent)
    resolveList(opm, gent)
    resolveCreate(opm, gent)
    resolveUpdate(opm, gent)
    resolveDelete(opm, gent)
    resolvePatch(opm, gent)


    // per path add select:param:name = false for params from other paths
    // updateSelect(opm)

    console.log('OPM', entname, formatJSONIC(opm))

    apimodel.main.sdk.entity[entname].op = opm

    msg += gent.name + ' '
  })

  console.log('=== operationTransform ===')
  console.log(formatJSONIC(apimodel.main.sdk.entity))

  return { ok: true, msg }
}


type OpName =
  'load' |
  'list' |
  'create' |
  'update' |
  'delete' |
  'patch'

type MethodName = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'

type GuideOp = {
  method: MethodName
}


type GuideEntity = {
  name: string
  pathlist$: {
    op?: {
      load?: GuideOp,
      list?: GuideOp,
      create?: GuideOp,
      update?: GuideOp,
      delete?: GuideOp,
      patch?: GuideOp,
    }
  }[]
  op$: Record<string, {
    paths: any[]
  }>
}


function collectOps(gent: GuideEntity) {
  gent.op$ = gent.op$ ?? {}
  each(gent.pathlist$, (gpath: GuideEntity["pathlist$"][number]) => {
    each(gpath.op, (gop: any, opname: string) => {
      gent.op$[opname] = gent.op$[opname] ?? { paths: [] }
      const pdef = {
        ...gpath,
        method: gop.method ?? 'GET'
      }
      delete pdef.op
      gent.op$[opname].paths.push(pdef)
    })
  })
}




function resolveLoad(opm: OpMap, gent: GuideEntity): undefined | OpDesc {
  const opdesc = opm.load = resolveOp('load', gent)
  return opdesc
}


function resolveList(opm: OpMap, gent: GuideEntity): undefined | OpDesc {
  const opdesc = opm.list = resolveOp('list', gent)
  return opdesc
}


function resolveCreate(opm: OpMap, gent: GuideEntity): undefined | OpDesc {
  const opdesc = opm.create = resolveOp('create', gent)
  return opdesc
}


function resolveUpdate(opm: OpMap, gent: GuideEntity): undefined | OpDesc {
  const opdesc = opm.update = resolveOp('update', gent)
  return opdesc
}


function resolveDelete(opm: OpMap, gent: GuideEntity): undefined | OpDesc {
  const opdesc = opm.delete = resolveOp('delete', gent)
  return opdesc
}


function resolvePatch(opm: OpMap, gent: GuideEntity): undefined | OpDesc {
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


function resolveOp(opname: OpName, gent: GuideEntity): undefined | OpDesc {
  let opdesc: undefined | OpDesc = undefined
  let opraw = gent.op$[opname]
  if (opraw) {
    opdesc = {
      name: opname,
      alt: opraw.paths.map(p => {
        const parts = applyRename(p)
        return {
          orig: p.orig,
          parts,
          method: p.method,
          select: {
            param: parts
              .filter(p => '{' === p[0])
              .map(p => p.substring(1, p.length - 1))
              .reduce((a, p) => (a[p] = true, a), {} as any)
          }
        }
      })
    }
  }
  return opdesc
}


function applyRename(rawpath: {
  parts: string[],
  rename?: { param?: Record<string, string> }
}): string[] {
  const prn: Record<string, string> = rawpath.rename?.param ?? {}
  return rawpath.parts.map(p => '{' === p[0] ? (prn[p.substring(1, p.length - 1)] ?? p) : p)
}




export {
  operationTransform,
}
