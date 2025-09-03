

import { each, snakify } from 'jostraca'

import type { TransformResult, Transform } from '../transform'

import { fixName } from '../transform'

import { depluralize } from '../utility'


const entityTransform: Transform = async function(
  ctx: any,
): Promise<TransformResult> {
  const { apimodel, model, def, guide } = ctx

  let msg = ''

  each(guide.entity, (guideEntity: any) => {
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

    /*
    let ancestors: string[] = []
    let ancestorsDone = false

    each(guideEntity.path, (guidePath: any, pathStr: string) => {
      const path = guidePath.key$
      const pathdef = def.paths[path]

      if (null == pathdef) {
        throw new Error('path not found in OpenAPI: ' + path +
          ' (entity: ' + guideEntity.name + ')')
      }

      // TODO: is this needed?
      guidePath.parts$ = path.split('/')
      guidePath.params$ = guidePath.parts$
        .filter((p: string) => p.startsWith('{'))
        .map((p: string) => p.substring(1, p.length - 1))

      if (!ancestorsDone) {
        // Find all path sections matching /foo/{..param..} and build ancestors array
        const paramRegex = /\/([a-zA-Z0-9_-]+)\/\{[a-zA-Z0-9_-]+\}/g
        let m
        while ((m = paramRegex.exec(pathStr)) !== null) {
          // Skip if this is the last section (the entity itself)
          const remainingPath = pathStr.substring(m.index + m[0].length)
          if (remainingPath.length > 0) {
            const ancestorName = depluralize(snakify(m[1]))
            ancestors.push(ancestorName)
          }
        }

        ancestorsDone = true
      }
    })

    entityModel.ancestors = ancestors
*/

    msg += guideEntity.name + ' '
  })


  console.dir(apimodel.main.sdk.entity, { depth: null })

  return { ok: true, msg }
}


type PathListItem = {
  orig: string
  parts: string[]
  rename: Record<string, any>
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
      rename
    })
  })

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

  return {
    ancestors
  }
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
