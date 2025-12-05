

import { each } from 'jostraca'

import type { TransformResult, Transform } from '../transform'

import { formatJSONIC } from '../utility'

import { KIT } from '../types'

import type { KitModel } from '../types'

import type {
  GuideEntity,
} from './top'

import type {
  GuidePath,
  PathDesc,
} from '../desc'

import type {
  ModelEntity,
} from '../model'




const entityTransform = async function(
  ctx: any,
): Promise<TransformResult> {
  const { apimodel, guide } = ctx
  const kit: KitModel = apimodel.main[KIT]

  let msg = ''

  each(guide.entity, (guideEntity: GuideEntity, entname: string) => {
    ctx.log.debug({ point: 'guide-entity', note: entname })

    const paths$ = resolvePathList(guideEntity, ctx.def)
    const relations = buildRelations(guideEntity, paths$)

    const modelent: ModelEntity = {
      name: entname,
      op: {},
      fields: [],
      id: {
        name: 'id',
        field: 'id',
      },
      relations,
    }

    kit.entity[entname] = modelent

    msg += guideEntity.name + ' '
  })

  return { ok: true, msg }
}



function resolvePathList(guideEntity: GuideEntity, def: { paths: Record<string, any> }) {
  const paths$: PathDesc[] = []

  each(guideEntity.path, (guidePath: GuidePath, orig: string) => {
    const parts = orig.split('/').filter(p => '' != p)
    const rename = guidePath.rename ?? {}

    each(rename.param, (param: any) => {
      const pI = parts.indexOf('{' + param.key$ + '}')
      parts[pI] = '{' + param.val$ + '}'
    })

    const pathdesc: PathDesc = {
      orig,
      parts,
      rename,
      method: '', // operation collectOps will copy and assign per op
      op: guidePath.op,
      def: def.paths[orig],
    }

    paths$.push(pathdesc)
  })

  guideEntity.paths$ = paths$

  return paths$
}



function buildRelations(guideEntity: any, paths$: PathDesc[]) {
  let ancestors: any[] = paths$
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


// True if array c is a suffix of array p,
function suffix(p: string[], c: string[]): boolean {
  return c.reduce((b, _, i) => (b && c[c.length - 1 - i] === p[p.length - 1 - i]), true)
}



export {
  resolvePathList,
  buildRelations,
  entityTransform,
}
