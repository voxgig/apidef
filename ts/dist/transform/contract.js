"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.contractTransform = void 0;
const contractTransform = async (ctx) => {
    const def = ctx.def || {};
    for (const entity of Object.values(ctx.apimodel.main.kit.entity || {})) {
        for (const op of Object.values(entity.op || {})) {
            for (const point of op?.points || []) {
                const path = def.paths?.[point.o];
                const method = path?.[point.m.toLowerCase()];
                const graphql = def.query?.[point.o] || def.mutation?.[point.o];
                if (!method && !graphql)
                    continue;
                const gpath = ctx.guide?.entity?.[entity.name]?.[graphql ? 'field' : 'path']?.[point.o];
                const guideOp = gpath?.op?.[op.name] ?? movedFrom(gpath, op.name, point.m);
                const hint = guideOp?.live;
                if (hint !== undefined) {
                    point.li = hint;
                }
                // Identity only; facts come from the capability. See
                // docs/design/resolved-spec-capability.md
                point.co = { version: 2, id: point.m + ' ' + point.o,
                    source: graphql ? 'graphql' : def.swagger ? 'swagger2' : 'openapi3' };
            }
        }
    }
    return { ok: true, msg: 'contract' };
};
exports.contractTransform = contractTransform;
// update also holds a promoted PATCH and a create made only of actions, whose
// guide ops keep their own names: the one with the point's method is its own.
function movedFrom(gpath, opname, method) {
    if ('update' !== opname)
        return undefined;
    return ['patch', 'create'].map((name) => gpath?.op?.[name]).find((gop) => null != gop && String(gop.method ?? '').toUpperCase() === String(method).toUpperCase());
}
//# sourceMappingURL=contract.js.map