"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.manualTransform = void 0;
const jsonic_next_1 = require("@jsonic/jsonic-next");
const { deep } = jsonic_next_1.Jsonic.util;
const manualTransform = async function (ctx, guide, tspec, model, def) {
    const { model: { main: { guide: { manual } } } } = ctx;
    deep(model, manual);
    return { ok: true, msg: 'manual' };
};
exports.manualTransform = manualTransform;
//# sourceMappingURL=manual.js.map