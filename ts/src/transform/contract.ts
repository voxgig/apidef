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
        const gpath = ctx.guide?.entity?.[entity.name]?.[graphql ? 'field' : 'path']?.[point.o]
        const guideOp = ownGuideOp(gpath, op.name, point.m)
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


// update also holds a promoted PATCH and a create made only of actions, whose
// guide ops keep their own names: the one with the point's method is its own.
function ownGuideOp(gpath: any, opname: string, method: string): any {
  const named = gpath?.op?.[opname]
  if ('update' !== opname || sameMethod(named, method)) return named
  return ['patch', 'create'].map((name) => gpath?.op?.[name])
    .find((gop: any) => sameMethod(gop, method)) ?? named
}


function sameMethod(gop: any, method: string): boolean {
  return null != gop && String(gop.method ?? '').toUpperCase() === String(method).toUpperCase()
}
