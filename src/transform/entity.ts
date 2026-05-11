

import { each } from 'jostraca'

import type { TransformResult, Transform } from '../transform'

import { KIT } from '../types'

import type { KitModel } from '../types'

import type {
  GuideEntity,
  GuidePath,
} from '../types'

import type {
  PathDesc,
} from '../desc'

import type {
  ModelEntity,
} from '../model'



const entityTransform: Transform = async function(
  ctx: any,
): Promise<TransformResult> {
  const { apimodel, guide } = ctx
  const kit: KitModel = apimodel.main[KIT]

  let msg = ''

  // Pre-pass: merge collection paths into the entity that owns the
  // per-instance paths. Heuristic01 sometimes assigns "/people" to a
  // separate "*_search" entity (because the response wraps Person in
  // a search/pagination component) while "/people/{id}" and
  // "/people/{id}/anime" land on "person". Result: the person entity has
  // no primary list endpoint, so direct-load tests can't bootstrap an
  // ID. Move "/people" onto person here; this also clears the way for
  // sensible flow generation (one entity, one collection, multiple
  // sub-resources).
  mergeCollectionPaths(guide, ctx.log)

  each(guide.entity, (guideEntity: GuideEntity, entname: string) => {
    ctx.log.debug({ point: 'guide-entity', note: entname })

    const paths$ = resolvePathList(guideEntity, ctx.def)
    const relations = buildRelations(guideEntity, paths$)

    const modelent: ModelEntity = {
      name: entname,
      op: {},
      fields: [],
      relations,
    }

    kit.entity[entname] = modelent

    msg += guideEntity.name + ' '
  })

  return { ok: true, msg }
}


// Move "/X" paths onto the entity that owns "/X/{id}" or "/X/{id}/sub".
// Only acts when the path "/X" sits on a different entity than the
// per-instance paths — leaves correctly-classified APIs alone.
function mergeCollectionPaths(guide: any, log?: any) {
  const entities = guide.entity as Record<string, any>

  // First pass: build collectionRoot -> owner-entity-name map.
  // owner is the entity whose name contains "/X/{...}" paths; we prefer
  // the owner whose direct-load path is "/X/{id}" (no further segments)
  // so that nested-resource entities don't claim the root.
  const rootOwners: Record<string, { ename: string, depth: number }> = {}

  for (const [ename, entity] of Object.entries(entities)) {
    for (const pathStr of Object.keys(entity.path ?? {})) {
      // Match /A/{...} or /A/{...}/...
      const m = pathStr.match(/^\/([^\/{}]+)\/\{[^}]+\}(\/.*)?$/)
      if (!m) continue
      const root = m[1]
      const trailing = m[2] ?? ''
      // Depth = number of segments after the {id} placeholder. Lower
      // depth wins (e.g. "/people/{id}" beats "/people/{id}/anime").
      const depth = trailing === '' ? 0 : trailing.split('/').filter(Boolean).length

      const cur = rootOwners[root]
      if (!cur || depth < cur.depth) {
        rootOwners[root] = { ename, depth }
      }
    }
  }

  // Second pass: for each entity with a "/X" path, if X has an owner
  // elsewhere, move the path there.
  for (const [ename, entity] of Object.entries(entities)) {
    if (entity.path == null) continue
    const pathsToMove: string[] = []

    for (const pathStr of Object.keys(entity.path)) {
      // Match exactly /X (one literal segment, no params).
      const m = pathStr.match(/^\/([^\/{}]+)$/)
      if (!m) continue
      const root = m[1]
      const owner = rootOwners[root]
      if (owner && owner.ename !== ename) {
        pathsToMove.push(pathStr)
      }
    }

    for (const pathStr of pathsToMove) {
      const owner = rootOwners[pathStr.slice(1)]
      const targetEntity = entities[owner.ename]
      if (targetEntity == null) continue
      targetEntity.path = targetEntity.path ?? {}
      // If the target already has this path (unlikely), leave it alone.
      if (targetEntity.path[pathStr] == null) {
        targetEntity.path[pathStr] = entity.path[pathStr]
      }
      delete entity.path[pathStr]
      log?.debug?.({
        point: 'merge-collection-path',
        path: pathStr,
        from: ename,
        to: owner.ename,
      })
    }
  }

  // Drop entities that are now empty after the merge.
  for (const ename of Object.keys(entities)) {
    if (entities[ename].path == null || Object.keys(entities[ename].path).length === 0) {
      delete entities[ename]
    }
  }
}



function resolvePathList(guideEntity: GuideEntity, def: { paths: Record<string, any> }) {
  const paths$: PathDesc[] = []

  each(guideEntity.path, (guidePath: GuidePath, orig: string) => {
    const parts = orig.split('/').filter(p => '' != p)
    const rename = guidePath.rename ?? {}

    each(rename.param, (param: any) => {
      const pI = parts.indexOf('{' + param.key$ + '}')
      if (pI >= 0) parts[pI] = '{' + param.val$ + '}'
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

    ; (guideEntity as any).paths$ = paths$

  return paths$
}



function buildRelations(guideEntity: any, paths$: PathDesc[]) {
  // An ancestor is a literal collection segment (e.g. "rems") followed by
  // a path-param placeholder that names an instance ID. We only collect
  // the literal parts — placeholder parts like "{año}" must be excluded
  // even when they're themselves followed by another placeholder, otherwise
  // downstream code treats `{año}` as an ancestor name and emits broken
  // idmap entries / match keys.
  let ancestors: any[] = paths$
    .map(pli => pli.parts
      .map((p, i) =>
        ('{' !== p[0] &&
          pli.parts[i + 1]?.[0] === '{' &&
          pli.parts[i + 1] !== '{id}') ? p : null)
      .filter(p => null != p))
    .filter(n => 0 < n.length)
    .sort((a, b) => a.length - b.length)

  // remove suffixes: keep only ancestors that are not a suffix of any later ancestor
  ancestors = ancestors
    .filter((n, j) => {
      for (let k = j + 1; k < ancestors.length; k++) {
        if (suffix(ancestors[k], n)) return false
      }
      return true
    })

  const relations = {
    ancestors
  }

  guideEntity.relations$ = relations

  return relations
}


// True if array c is a suffix of array p.
function suffix(p: string[], c: string[]): boolean {
  if (c.length > p.length) return false
  for (let i = 0; i < c.length; i++) {
    if (c[c.length - 1 - i] !== p[p.length - 1 - i]) return false
  }
  return true
}



export {
  resolvePathList,
  buildRelations,
  entityTransform,
}
