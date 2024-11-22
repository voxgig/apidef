"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.topTransform = topTransform;
async function topTransform(ctx, tspec, model, def) {
    const { spec } = ctx;
    // fixName(model.main.api, spec.meta.name)
    model.main.def.desc = def.info.description;
    return { ok: true, msg: 'top' }; // , msg: spec.meta.name }
}
//# sourceMappingURL=top.js.map