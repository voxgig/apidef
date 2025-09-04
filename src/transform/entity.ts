

import { each, snakify } from 'jostraca'

import type { TransformResult, Transform } from '../transform'

import { fixName } from '../transform'

import { formatJSONIC } from '../utility'


const entityTransform: Transform = async function(
  ctx: any,
): Promise<TransformResult> {
  const { apimodel, guide } = ctx

  let msg = ''

  each(guide.entity, (guideEntity: any) => {
    console.log(guideEntity)

    const entityName = guideEntity.key$
    ctx.log.debug({ point: 'guide-entity', note: entityName })

    const pathlist$ = resolvePathList(guideEntity)
    const relations = buildRelations(guideEntity, pathlist$)

    apimodel.main.sdk.entity[entityName] = {
      name: entityName,
      op: {},
      field: {},
      id: {
        name: 'id',
        field: 'id',
      },
      relations,

      pathlist$
    }

    msg += guideEntity.name + ' '
  })

  console.log('=== entityTransform ===')
  console.log(formatJSONIC(apimodel.main.sdk.entity))

  return { ok: true, msg }
}


type PathListItem = {
  orig: string
  parts: string[]
  rename: Record<string, any>
  op: Record<string, any>
}


function resolvePathList(guideEntity: any) {
  const pathlist$: PathListItem[] = []

  each(guideEntity.path, (guidePath: any, orig: string) => {
    const parts = orig.split('/').filter(p => '' != p)
    const rename = guidePath.rename ?? {}

    each(rename.param, (param: any) => {
      const pI = parts.indexOf('{' + param.key$ + '}')
      parts[pI] = '{' + param.val$ + '}'
    })

    pathlist$.push({
      orig,
      parts,
      rename,
      op: guidePath.op
    })
  })

  guideEntity.pathlist$ = pathlist$

  return pathlist$
}




function buildRelations(guideEntity: any, pathlist$: PathListItem[]) {
  let ancestors: any[] = pathlist$
    .map(pli => pli.parts
      .map((p, i) =>
        (pli.parts[i + 1]?.[0] === '{' && pli.parts[i + 1] !== '{id}') ? p : null)
      .filter(p => null != p))
    .filter(n => 0 < n.length)
    .sort((a, b) => a.length - b.length)

  // remove suffixes
  ancestors = ancestors
    .reduce((a, n, j) =>
    ((0 < (ancestors.slice(j + 1).filter(p => suffix(p, n))).length
      ? null : a.push(n)), a), [])

  const relations = {
    ancestors
  }

  guideEntity.relations$ = relations

  return relations
}

// true if c is a suffix of p
function suffix(p: string[], c: string[]) {
  return c.reduce((b, _, i) => (b && c[c.length - 1 - i] === p[p.length - 1 - i]), true)
}



export {
  resolvePathList,
  buildRelations,
  entityTransform,
}
