

import { each, snakify } from 'jostraca'

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

import { depluralize, guideActive } from '../utility'



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
  // Path-shaped collection merging is meaningless for root-field guides.
  if (true !== ctx.def?.graphql) {
    mergeCollectionPaths(guide, ctx.log)
  }

  each(guide.entity, (guideEntity: GuideEntity, entname: string) => {
    // `active: false` in guide.aontu drops the entity. The guide model has
    // always declared `active?: boolean` at entity, path and op level and the
    // docs call it the intended escape hatch, but nothing read it — so an
    // entity a heuristic invented (a response envelope classified as a
    // resource, say) could not be removed by the one file a user is meant to
    // edit. Absent means active, so existing guides are unaffected.
    if (!guideActive(guideEntity)) {
      ctx.log.debug({ point: 'guide-entity', note: entname, active: false })
      return
    }

    ctx.log.debug({ point: 'guide-entity', note: entname })

    const graphql = true === ctx.def?.graphql

    const paths$ = graphql ?
      resolveFieldList(guideEntity, ctx.def) :
      resolvePathList(guideEntity, ctx.def)

    // Ancestry is inferred from literal/{param} path pairs, which root
    // fields do not have; GraphQL relations come from the schema instead
    // (see transform/graphql.ts).
    const relations = graphql ?
      { ancestors: [] } :
      buildRelations(guideEntity, paths$)

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
      const srcPath = entity.path[pathStr]
      const tgtPath = targetEntity.path[pathStr]
      if (tgtPath == null) {
        targetEntity.path[pathStr] = srcPath
      }
      else {
        // Target already owns this path under a different heuristic-discovered
        // entity (e.g. `/gists` GET on `base_gist`, `/gists` POST on `gist`).
        // Merge op/action/rename sets so no method is silently lost — without
        // this, the second source's contribution drops on the floor and the
        // base-guide loses paths that were in the original spec.
        if (srcPath?.op) {
          tgtPath.op = tgtPath.op ?? {}
          for (const opname of Object.keys(srcPath.op)) {
            if (tgtPath.op[opname] == null) {
              tgtPath.op[opname] = srcPath.op[opname]
            }
          }
        }
        if (srcPath?.action) {
          tgtPath.action = tgtPath.action ?? {}
          for (const aname of Object.keys(srcPath.action)) {
            if (tgtPath.action[aname] == null) {
              tgtPath.action[aname] = srcPath.action[aname]
            }
          }
        }
        if (srcPath?.rename?.param) {
          tgtPath.rename = tgtPath.rename ?? {}
          tgtPath.rename.param = tgtPath.rename.param ?? {}
          for (const p of Object.keys(srcPath.rename.param)) {
            if (tgtPath.rename.param[p] == null) {
              tgtPath.rename.param[p] = srcPath.rename.param[p]
            }
          }
        }
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
}



function resolvePathList(guideEntity: GuideEntity, def: { paths: Record<string, any> }) {
  const paths$: PathDesc[] = []

  each(guideEntity.path, (guidePath: GuidePath, orig: string) => {
    // Path-level opt-out (see the entity-level note above).
    if (!guideActive(guidePath)) {
      return
    }

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


// Root-field equivalent of resolvePathList for GraphQL guides. A root field
// has no path to split, so `parts` stays empty (GraphQL points address the
// single endpoint and carry their operation document instead) and `def` is
// the normalised root-field descriptor rather than a path item.
function resolveFieldList(guideEntity: GuideEntity, def: any) {
  const paths$: PathDesc[] = []

  each((guideEntity as any).field, (guideField: GuidePath, orig: string) => {
    if (!guideActive(guideField)) {
      return
    }

    // The root field lives under query or mutation depending on the op type
    // the guide recorded.
    const optype = Object.values(guideField.op ?? {})
      .map((o: any) => o.optype)
      .find((t: any) => null != t) ?? 'query'

    const fielddef = 'mutation' === optype ?
      def.mutation?.[orig] : def.query?.[orig]

    // The guide expresses GraphQL renames as `rename: arg:` (root fields
    // have arguments, not path params), while the model's arg machinery
    // reads `rename.param`. Translate so a user override actually applies.
    const grename: any = guideField.rename ?? {}
    const rename: any = null != grename.arg ?
      { ...grename, param: { ...(grename.param ?? {}), ...grename.arg } } :
      grename

    const pathdesc: PathDesc = {
      orig,
      parts: [],
      rename,
      method: '', // operation collectOps will copy and assign per op
      op: guideField.op,
      def: fielddef,
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
  //
  // Each captured segment is then normalised to its entity name —
  // depluralize+snakify — so that "files"/"audit-log" become "file"/"audit_log",
  // i.e. the same keys downstream code uses to look up entities. Without this,
  // `apimodel.main.kit.entity[ancestorName]` misses the parent entity for
  // pluralised path segments.
  let ancestors: any[] = paths$
    .map(pli => pli.parts
      .map((p, i) =>
        ('{' !== p[0] &&
          pli.parts[i + 1]?.[0] === '{' &&
          pli.parts[i + 1] !== '{id}') ? depluralize(snakify(p)) : null)
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
  mergeCollectionPaths,
}
