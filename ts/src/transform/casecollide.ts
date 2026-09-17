import { each, camelify } from 'jostraca'

import type { TransformResult, Transform } from '../transform'

import { KIT } from '../types'
import type { KitModel } from '../types'


// TWO ENTITY NAMES THAT DIFFER ONLY IN CASE ARE ONE FILE.
//
// Generators name files after the entity's camel form — `OptOutEntity.ts`,
// `OptoutEntity.ts` — and APFS and NTFS, so macOS and Windows by default,
// treat those as the SAME file. The second write replaces the first, and the
// TypeScript compiler stops the build outright:
//
//   File name 'OptoutEntity.ts' differs from already included file name
//   'OptOutEntity.ts' only in casing.
//
// It happens because two different derivations of the same resource land on
// names that snakify differently: Customer.io's App API produced `opt_out`
// (from the schema) and `optout` (from the `/v1/optouts` path segment), for
// one resource.
//
// WHERE ONE OF THEM CARRIES NO OPERATIONS, it generates an entity class with
// no methods — nothing a caller could use — while breaking the build for the
// one that does. That one is dropped here, and the drop is logged with both
// names so it is visible rather than inferred.
//
// WHERE BOTH CARRY OPERATIONS the collision is NOT resolved: dropping either
// would silently remove operations from the SDK, which is worse than a build
// that fails loudly. A warning names them and generation proceeds.
//
// This runs after operationTransform (so ops are known) and before
// flowTransform (so no flow is built for an entity about to be dropped).
// Empty the way cleanTransform means it: a node holding only empty nodes is
// itself empty and does not survive into the model.
function deepempty(v: any): boolean {
  if (null == v) return true
  if ('object' !== typeof v) return false
  const keys = Object.keys(v)
  if (0 === keys.length) return true
  return keys.every((k) => deepempty(v[k]))
}


const casecollideTransform: Transform = async function(
  ctx: any,
): Promise<TransformResult> {
  const { apimodel, guide } = ctx
  const kit: KitModel = apimodel.main[KIT]

  const bylower: { [lower: string]: string[] } = {}
  each(kit.entity, (_entity: any, entname: string) => {
    const lower = String(camelify(entname)).toLowerCase()
    bylower[lower] = bylower[lower] || []
    bylower[lower].push(entname)
  })

  const dropped: string[] = []

  for (const lower of Object.keys(bylower)) {
    const group = bylower[lower].sort()
    if (group.length < 2) continue

    // COUNT ONLY OPERATIONS THAT SURVIVE. An entity can carry op KEYS whose
    // bodies are empty, or hold nothing but more empty nodes. cleanTransform
    // strips those at the end of the pipeline — "including ancestors if thus
    // also empty" — and an entity left with none generates a class with no
    // methods. Counting the keys alone reported `optout` as carrying two
    // operations when it had none that would reach the SDK, so this applies
    // the same recursive test clean does.
    const opcount = (name: string) => {
      const ops = (kit.entity as any)[name]?.op || {}
      return Object.keys(ops).filter((opname) => !deepempty(ops[opname])).length
    }

    const withops = group.filter(n => 0 < opcount(n))
    const noops = group.filter(n => 0 === opcount(n))

    if (0 === withops.length || 0 === noops.length) {
      ctx.log.warn({
        point: 'entity-case-collision',
        entity: group,
        note: 'entity names differ only by case and all carry operations: ' +
          group.join(', ') + ' — the generated files collide on a ' +
          'case-insensitive filesystem. Not resolved here: dropping one ' +
          'would remove operations from the SDK.'
      })
      continue
    }

    for (const name of noops) {
      delete (kit.entity as any)[name]
      if (guide?.entity) delete guide.entity[name]
      dropped.push(name)
      ctx.log.info({
        point: 'entity-case-collision-drop',
        entity: name,
        kept: withops,
        note: 'dropped entity ' + name + ': it carries no operations and its ' +
          'name differs only by case from ' + withops.join(', ') +
          ', so both would generate to one file.'
      })
    }
  }

  return { ok: true, msg: 0 === dropped.length ? '' : 'dropped: ' + dropped.join(',') }
}


export {
  casecollideTransform
}
