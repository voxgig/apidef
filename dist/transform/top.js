"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.topTransform = topTransform;
async function topTransform(ctx, tspec, model, def) {
    const { spec } = ctx;
    model.main.def.info = def.info;
    model.main.def.servers = def.servers;
    return { ok: true, msg: 'top' };
}
//# sourceMappingURL=top.js.map