"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanTransform = void 0;
const struct_1 = require("@voxgig/struct");
const cleanTransform = async function (ctx) {
    const { apimodel } = ctx;
    (0, struct_1.walk)(apimodel, (k, v) => {
        if ('string' === typeof k && k.includes('$')) {
            return undefined;
        }
        return v;
    });
    return { ok: true, msg: 'clean' };
};
exports.cleanTransform = cleanTransform;
//# sourceMappingURL=clean.js.map