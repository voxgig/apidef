"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.manualTransform = manualTransform;
const jsonic_next_1 = require("@jsonic/jsonic-next");
const { deep } = jsonic_next_1.Jsonic.util;
async function manualTransform(ctx, tspec, model, def) {
    const { guide: { guide: { manual } } } = ctx;
    deep(model, manual);
    return { ok: true, msg: 'manual' };
}
//# sourceMappingURL=manual.js.map