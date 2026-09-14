// Lossless point facts. JSON protects explicit empty contracts and schema
// keywords from aontu unification and the model's empty-node cleanup.
import type { Transform } from '../transform'

export function contractJSON(value: any): string {
  const ancestors = new Map<any, string>()
  function copy(v: any, path: string): any {
    if (v === null || typeof v !== 'object') return v
    if (ancestors.has(v)) return { $ref: ancestors.get(v) }
    ancestors.set(v, path)
    const out: any = Array.isArray(v) ? v.map((item, i) => copy(item, path + '/' + i)) : {}
    if (!Array.isArray(v)) for (const k of Object.keys(v).sort()) {
      if (!k.endsWith('$') && !k.startsWith('x-') && undefined !== v[k]) out[k] = copy(v[k], path + '/' + k.replace(/~/g, '~0').replace(/\//g, '~1'))
    }
    ancestors.delete(v)
    return out
  }
  return JSON.stringify(copy(value, '#'))
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
        const facts: any = { protocol: graphql ? 'graphql' : 'http' }
        if (graphql) {
          facts.field = graphql
          facts.types = graphqlInputTypes(graphql, def.types || {})
          facts.typesScope = 'inputs'
          facts.invocation = point.graphql
        } else {
          for (const key of ['operationId', 'requestBody', 'responses', 'consumes', 'produces']) {
            if (undefined !== method[key]) facts[key] = method[key]
          }
          facts.parameters = [...(path.parameters || []), ...(method.parameters || [])]
          facts.security = method.security ?? def.security
          facts.securitySource = method.security !== undefined ? 'operation' :
            def.security !== undefined ? 'definition' : 'unspecified'
          facts.securitySchemes = def.components?.securitySchemes ?? def.securityDefinitions
          facts.consumes ??= def.consumes
          facts.produces ??= def.produces
        }
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
