"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.contractTransform = void 0;
const contractTransform = async (ctx) => {
    const def = ctx.def || {};
    for (const entity of Object.values(ctx.apimodel.main.kit.entity || {})) {
        for (const op of Object.values(entity.op || {})) {
            for (const point of op?.points || []) {
                const path = def.paths?.[point.orig];
                const method = path?.[point.method.toLowerCase()];
                const graphql = def.query?.[point.orig] || def.mutation?.[point.orig];
                if (!method && !graphql)
                    continue;
                const guideOp = ctx.guide?.entity?.[entity.name]?.[graphql ? 'field' : 'path']?.[point.orig]?.op?.[op.name];
                const hint = guideOp?.live;
                if (hint !== undefined) {
                    point.live = hint;
                }
                // Identity only; facts come from the capability. See
                // docs/design/resolved-spec-capability.md
                point.contract = { version: 1, id: point.method + ' ' + point.orig,
                    source: graphql ? 'graphql' : def.swagger ? 'swagger2' : 'openapi3' };
            }
        }
    }
    return { ok: true, msg: 'contract' };
};
exports.contractTransform = contractTransform;
//# sourceMappingURL=contract.js.map