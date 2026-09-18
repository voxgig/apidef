// Lossless point facts. JSON protects explicit empty contracts and schema
// keywords from aontu unification and the model's empty-node cleanup.
import type { Transform } from '../transform'

import { operationFacts } from '../resolved'


export function contractJSON(value: any): string {
  function walk(root: any, base: string): any {
    // One memo per fact, so refs stay local to it.
    const seen = new Map<any, string>()
    function copy(v: any, path: string): any {
      if (v === null || typeof v !== 'object') return v
      if (seen.has(v)) return { $ref: seen.get(v) }
      seen.set(v, path)
      const out: any = Array.isArray(v) ? v.map((item, i) => copy(item, path + '/' + i)) : {}
      if (!Array.isArray(v)) for (const k of Object.keys(v).sort()) {
        if (!k.endsWith('$') && !k.startsWith('x-') && undefined !== v[k]) out[k] = copy(v[k], path + '/' + k.replace(/~/g, '~0').replace(/\//g, '~1'))
      }
      return out
    }
    return copy(root, base)
  }

  if (null === value || 'object' !== typeof value || Array.isArray(value)) {
    return JSON.stringify(walk(value, '#'))
  }

  const out: any = {}
  for (const k of Object.keys(value).sort()) {
    if (k.endsWith('$') || k.startsWith('x-') || undefined === value[k]) continue
    out[k] = walk(value[k], '#/' + k.replace(/~/g, '~0').replace(/\//g, '~1'))
  }
  return JSON.stringify(out)
}

// An operation needs its argument types, including recursive input objects.
// Output types are represented by the field and generated invocation selection;
// copying the entire connected output graph per operation is quadratic in API size.
export function graphqlInputTypes(field: any, types: any): any {
  const out: any = {}
  function visit(name: string) {
    if (!types[name] || Object.prototype.hasOwnProperty.call(out, name)) return
    const type = types[name]
    out[name] = type
    if (type.kind === 'INPUT_OBJECT') {
      for (const child of Object.values(type.fields || {}) as any[]) visit(child.type)
    }
  }
  for (const arg of field.args || []) visit(arg.type)
  return out
}

export const contractTransform: Transform = async (ctx: any) => {
  const def = ctx.def || {}
  for (const entity of Object.values(ctx.apimodel.main.kit.entity || {}) as any[]) {
    for (const op of Object.values(entity.op || {}) as any[]) {
      for (const point of op?.points || []) {
        const path = def.paths?.[point.orig]
        const method = path?.[point.method.toLowerCase()]
        const graphql = def.query?.[point.orig] || def.mutation?.[point.orig]
        if (!method && !graphql) continue
        const facts: any = operationFacts(def, point)
        if (null == facts) continue

        // A property of the point, not of the definition.
        if (graphql) facts.invocation = point.graphql
        const guideOp = ctx.guide?.entity?.[entity.name]?.[graphql ? 'field' : 'path']?.[point.orig]?.op?.[op.name]
        const hint = guideOp?.live
        for (const key of ['requestBody', 'responses', 'parameters', 'security']) {
          if (guideOp?.contract?.[key] !== undefined) {
            facts[key] = guideOp.contract[key]
            ;(facts.factSources ??= {})[key] = 'guide'
          }
        }
        if (hint !== undefined) facts.live = hint
        point.contract = { version: 1, id: point.method + ' ' + point.orig,
          source: graphql ? 'graphql' : def.swagger ? 'swagger2' : 'openapi3',
          json: contractJSON(facts) }
      }
    }
  }
  return { ok: true, msg: 'contract' }
}
