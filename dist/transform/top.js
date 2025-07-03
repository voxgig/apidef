"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.topTransform = void 0;
const topTransform = async function (ctx) {
    const { apimodel, def } = ctx;
    // const { spec } = ctx
    apimodel.main.def.info = def.info;
    apimodel.main.def.servers = def.servers;
    return { ok: true, msg: 'top' };
};
exports.topTransform = topTransform;
//# sourceMappingURL=top.js.map