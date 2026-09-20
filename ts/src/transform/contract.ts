// Point contracts. See docs/design/resolved-spec-capability.md
import type { Transform } from '../transform'

export const contractTransform: Transform = async (ctx: any) => {
  const def = ctx.def || {}
  for (const entity of Object.values(ctx.apimodel.main.kit.entity || {}) as any[]) {
    for (const op of Object.values(entity.op || {}) as any[]) {
      for (const point of op?.points || []) {
        const path = def.paths?.[point.o]
        const method = path?.[point.m.toLowerCase()]
        const graphql = def.query?.[point.o] || def.mutation?.[point.o]
        if (!method && !graphql) continue
        const guideOp = ctx.guide?.entity?.[entity.name]?.[graphql ? 'field' : 'path']?.[point.o]?.op?.[op.name]
        const hint = guideOp?.live
        if (hint !== undefined) {
          point.li = hint
        }
        // Identity only; facts come from the capability. See
        // docs/design/resolved-spec-capability.md
        point.co = { version: 2, id: point.m + ' ' + point.o,
          source: graphql ? 'graphql' : def.swagger ? 'swagger2' : 'openapi3' }
      }
    }
  }
  return { ok: true, msg: 'contract' }
}
