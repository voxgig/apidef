"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.topTransform = void 0;
const struct_1 = require("@voxgig/struct");
const types_1 = require("../types");
const topTransform = async function (ctx) {
    const { apimodel, def } = ctx;
    const kit = apimodel.main[types_1.KIT];
    kit.info = def.info;
    kit.info.servers = def.servers ?? [];
    // Swagger 2.0
    if (def.host) {
        kit.info.servers.push({
            url: (def.schemes?.[0] ?? 'https') + '://' + (0, struct_1.joinurl)([def.host, def.basePath])
        });
    }
    return { ok: true, msg: 'top' };
};
exports.topTransform = topTransform;
//# sourceMappingURL=top.js.map