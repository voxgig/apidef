import { each, camelify } from 'jostraca'

import type { TransformResult, Transform } from '../transform'

import { KIT } from '../types'
import type { KitModel } from '../types'


// See docs/design/derived-names.md
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

    // See docs/design/derived-names.md
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
