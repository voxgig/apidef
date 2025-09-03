"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.topTransform = void 0;
const struct_1 = require("@voxgig/struct");
const topTransform = async function (ctx) {
    const { apimodel, def } = ctx;
    apimodel.main.def.info = def.info;
    apimodel.main.def.servers = def.servers ?? [];
    // Swagger 2.0
    if (def.host) {
        apimodel.main.def.servers.push({
            url: (def.schemes?.[0] ?? 'https') + '://' + (0, struct_1.joinurl)([def.host, def.basePath])
        });
    }
    return { ok: true, msg: 'top' };
};
exports.topTransform = topTransform;
//# sourceMappingURL=top.js.map