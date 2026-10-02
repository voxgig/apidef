

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
  PathSegment,
} from '../desc'

import type {
  ModelEntity,
} from '../model'

import { depluralize, guideActive, paramName } from '../utility'

import { byCodePoint } from '../refcount'



const entityTransform: Transform = async function(
  ctx: any,
): Promise<TransformResult> {
  const { apimodel, guide } = ctx
  const kit: KitModel = apimodel.main[KIT]

  let msg = ''

  each(guide.entity, (guideEntity: GuideEntity, entname: string) => {
    if (!guideActive(guideEntity)) {
      ctx.log.debug({ point: 'guide-entity', note: entname, active: false })
      return
    }

    ctx.log.debug({ point: 'guide-entity', note: entname })

    const graphql = true === ctx.def?.graphql

    const paths$ = graphql ?
      resolveFieldList(guideEntity, ctx.def) :
      resolvePathList(guideEntity, ctx.def)

    const relations = graphql ?
      { ancestors: [] } :
      buildRelations(guideEntity, paths$)

    const modelent: ModelEntity = {
      name: entname,
      op: {},
      fields: {},
      relations,
    }

    kit.entity[entname] = modelent

    msg += guideEntity.name + ' '
  })

  filterEntityAncestors(kit.entity)
  return { ok: true, msg }
}

function filterEntityAncestors(entities: Record<string, any>) {
  for (const [name, entity] of Object.entries(entities)) {
    if (null == entity.relations) continue
    entity.relations.ancestors = (entity.relations.ancestors ?? [])
      .map((chain: string[]) => chain.filter(ancestor => ancestor !== name &&
        Object.prototype.hasOwnProperty.call(entities, ancestor)))
      .filter((chain: string[]) => 0 < chain.length)
  }
}


type CollectionOwner = {
  ename: string
  depth: number
  route: string
  item: boolean
}


// Move a collection path ("/X", "/api/v1/X", a trailing slash allowed) onto
// the entity owning the item path beneath it ("/X/{id}", or a composite key
// such as "/X/{owner}/{repo}"), when the two sit on different entities.
// Returns the entities the moves emptied, which are removed. Guide stage
// only: on the unified guide it would override guide.aontu.
function mergeCollectionPaths(
  guide: any,
  log?: any,
  recordRef?: (pathStr: string, methods: string[], collection: boolean) => string | null,
  distinct?: (sharePath: string, shareMethods: string[],
    itemPath: string, itemMethods: string[]) => boolean,
): string[] {
  const entities = guide.entity as Record<string, any>
  const emptied: string[] = []

  // Every route beneath a collection's literals, nearest first.
  const owners: Record<string, CollectionOwner[]> = {}

  for (const [ename, entity] of Object.entries(entities)) {
    for (const pathStr of Object.keys(entity.path ?? {})) {
      const m = pathStr.match(/^((?:\/[^\/{}]+)+)\/\{[^}]+\}(\/.*)?$/)
      if (!m) continue
      const rest = (m[2] ?? '').split('/').filter(Boolean)
      const item = rest.every((seg: string) => /^\{[^}]+\}$/.test(seg))
      ;(owners[m[1]] = owners[m[1]] ?? []).push({ ename, depth: rest.length, route: pathStr, item })
    }
  }
  for (const candidates of Object.values(owners)) {
    candidates.sort((a: CollectionOwner, b: CollectionOwner) =>
      a.depth - b.depth || byCodePoint(a.ename, b.ename) || byCodePoint(a.route, b.route))
  }

  const methodsOf = (pathDesc: any): string[] => Object.values(pathDesc?.op ?? {})
    .map((op: any) => String(op?.method ?? '').toUpperCase())

  // The nearest item route owns the collection, one answering with the
  // collection's own record first. With no item route, a deeper route owns
  // it only on the record: a verb such as a token refresh returns the token,
  // while a sub-collection such as GitHub's plan accounts lists purchases.
  const ownerOf = (pathStr: string, methods: string[], candidates: CollectionOwner[]) => {
    const mine = recordRef?.(pathStr, methods, true) ?? null
    const same = (c: CollectionOwner) => null != mine &&
      mine === recordRef?.(c.route, methodsOf(entities[c.ename]?.path?.[c.route]), false)
    const items = candidates.filter((c) => c.item)
    return items.find(same) ?? items[0] ?? candidates.find(same)
  }

  // One owner for every entity's share of a collection path, so a list and
  // a create split between entities land together.
  const shares: Record<string, string[]> = {}
  for (const [ename, entity] of Object.entries(entities)) {
    for (const pathStr of Object.keys(entity.path ?? {})) {
      if (null != collectionRoot(pathStr)) {
        (shares[pathStr] = shares[pathStr] ?? []).push(ename)
      }
    }
  }
  const owned: Record<string, CollectionOwner | undefined> = {}
  for (const [pathStr, enames] of Object.entries(shares)) {
    const candidates = owners[collectionRoot(pathStr) as string]
    if (null != candidates) {
      owned[pathStr] = ownerOf(pathStr,
        enames.flatMap((ename: string) => methodsOf(entities[ename].path[pathStr])), candidates)
    }
  }

  // A share answering with its own record, unlike the owner's item's, stays.
  const apart = (ename: string, pathStr: string, owner: CollectionOwner) =>
    true === distinct?.(pathStr, methodsOf(entities[ename].path[pathStr]),
      owner.route, methodsOf(entities[owner.ename]?.path?.[owner.route]))

  // Second pass: for each entity with a "/X" path, if X has an owner
  // elsewhere, move the path there.
  for (const [ename, entity] of Object.entries(entities)) {
    if (entity.path == null) continue
    const pathsToMove: [string, CollectionOwner][] = []

    for (const pathStr of Object.keys(entity.path)) {
      const owner = owned[pathStr]
      if (null != owner && owner.ename !== ename && !apart(ename, pathStr, owner)) {
        pathsToMove.push([pathStr, owner])
      }
    }

    for (const [pathStr, owner] of pathsToMove) {
      const targetEntity = entities[owner.ename]
      if (targetEntity == null) continue
      targetEntity.path = targetEntity.path ?? {}
      const srcPath = entity.path[pathStr]
      const tgtPath = targetEntity.path[pathStr]
      if (tgtPath == null) {
        targetEntity.path[pathStr] = srcPath
      }
      else {
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

    if (0 < pathsToMove.length && 0 === Object.keys(entity.path).length) {
      emptied.push(ename)
    }
  }

  // With no path left it names nothing guide.aontu could switch back on.
  for (const ename of emptied) {
    delete entities[ename]
    log?.debug?.({ point: 'merge-collection-drop', entity: ename })
  }

  return emptied
}



// A path of literals only, less any trailing slash, is a collection path.
function collectionRoot(pathStr: string): string | null {
  const key = pathStr.replace(/\/+$/, '')
  return /^(?:\/[^\/{}]+)+$/.test(key) ? key : null
}


function resolvePathList(guideEntity: GuideEntity, def: { paths: Record<string, any> }) {
  const paths$: PathDesc[] = []

  each(guideEntity.path, (guidePath: GuidePath, orig: string) => {
    // Path-level opt-out (see the entity-level note above).
    if (!guideActive(guidePath)) {
      return
    }

    const rename = guidePath.rename ?? {}

    const segments: PathSegment[] = orig
      .split('/')
      .filter(p => '' != p)
      .map(p => {
        if ('{' !== p[0] || '}' !== p[p.length - 1]) {
          return { lit: nameLitParams(p, rename.param) }
        }
        const raw = p.slice(1, -1)
        if ('' === raw || raw.includes('{') || raw.includes('}')) {
          return { lit: nameLitParams(p, rename.param) }
        }
        // Renames map the spec's parameter name to the model's. Applied
        // here, on the NAME, rather than by rewriting a braced string.
        const renamed = (rename.param as any)?.[raw]
        return { var: null == renamed ? raw : String(renamed) }
      })

    const pathdesc: PathDesc = {
      orig,
      segments,
      rename,
      method: '', // operation collectOps will copy and assign per op
      op: guidePath.op,
      action: guidePath.action,
      def: def.paths[orig],
    }

    paths$.push(pathdesc)
  })

    ; (guideEntity as any).paths$ = paths$

  return paths$
}


// The runtimes fill a literal's placeholders by their parameters' model names.
function nameLitParams(lit: string, renames?: Record<string, any>): string {
  return lit.replace(/\{([^{}]+)\}/g, (placeholder: string, wire: string) => {
    const name = paramName(wire, renames)
    return '' === name ? placeholder : '{' + name + '}'
  })
}


// Root-field equivalent of resolvePathList for GraphQL guides. A root field
// has no path to split, so `segments` stays empty (GraphQL points address the
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
      segments: [],
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
  let ancestors: any[] = paths$
    .map(pli => pli.segments
      .map((s, i) => {
        const next = pli.segments[i + 1]
        return (null != s.lit && null != next?.var && 'id' !== next.var)
          ? depluralize(snakify(s.lit)) : null
      })
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
  filterEntityAncestors,
  resolvePathList,
  buildRelations,
  entityTransform,
  mergeCollectionPaths,
}
