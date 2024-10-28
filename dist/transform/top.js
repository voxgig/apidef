"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.topTransform = topTransform;
const transform_1 = require("../transform");
async function topTransform(ctx, tspec, model, def) {
    const { spec } = ctx;
    (0, transform_1.fixName)(model.main.api, spec.meta.name);
    model.main.def.desc = def.info.description;
    return { ok: true, msg: spec.meta.name };
}
//# sourceMappingURL=top.js.map