"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.manualTransform = void 0;
const jsonic_1 = require("jsonic");
const { deep } = jsonic_1.Jsonic.util;
const manualTransform = async function (ctx, guide, tspec, model, def) {
    const { manual } = guide;
    deep(model, manual);
    return { ok: true, msg: 'manual' };
};
exports.manualTransform = manualTransform;
//# sourceMappingURL=manual.js.map