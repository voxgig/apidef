"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.topTransform = void 0;
const topTransform = async function (ctx, guide, tspec, model, def) {
    const { spec } = ctx;
    model.main.def.info = def.info;
    model.main.def.servers = def.servers;
    return { ok: true, msg: 'top' };
};
exports.topTransform = topTransform;
//# sourceMappingURL=top.js.map