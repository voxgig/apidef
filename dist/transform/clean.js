"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanTransform = void 0;
const struct_1 = require("@voxgig/struct");
const cleanTransform = async function (ctx) {
    const { apimodel } = ctx;
    let cur = [];
    // Remove empty nodes and undefined values. This avoids spurious content in model.
    // NOTE: including ancestors if thus also empty!
    (0, struct_1.walk)(apimodel, (k, v, _p, ancestors) => {
        if (undefined === k) {
            cur[ancestors.length] = (0, struct_1.ismap)(v) ? {} : (0, struct_1.islist)(v) ? [] : v;
            return v;
        }
        let vi = v;
        if ((0, struct_1.isnode)(v)) {
            if ((0, struct_1.isempty)(v)) {
                vi = undefined;
            }
            else {
                vi = cur[ancestors.length] = (0, struct_1.ismap)(v) ? {} : [];
            }
        }
        if (undefined !== vi && !k.endsWith('$')) {
            cur[ancestors.length - 1][k] = vi;
        }
        return v;
    }, (k, _v, _p, ancestors) => {
        const pi = cur[ancestors.length - 1];
        if (undefined !== pi) {
            const vi = pi[k];
            if ((0, struct_1.isnode)(vi) && (0, struct_1.isempty)(vi)) {
                delete pi[k];
            }
        }
    });
    ctx.apimodel = cur[0];
    return { ok: true, msg: 'clean' };
};
exports.cleanTransform = cleanTransform;
//# sourceMappingURL=clean.js.map