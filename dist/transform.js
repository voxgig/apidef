"use strict";
/* Copyright (c) 2024 Voxgig, MIT License */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fixName = fixName;
exports.resolveTransforms = resolveTransforms;
exports.processTransforms = processTransforms;
const node_path_1 = __importDefault(require("node:path"));
const jostraca_1 = require("jostraca");
const top_1 = require("./transform/top");
const entity_1 = require("./transform/entity");
const operation_1 = require("./transform/operation");
const field_1 = require("./transform/field");
const manual_1 = require("./transform/manual");
const TRANSFORM = {
    top: top_1.topTransform,
    entity: entity_1.entityTransform,
    operation: operation_1.operationTransform,
    field: field_1.fieldTransform,
    manual: manual_1.manualTransform,
};
async function resolveTransforms(ctx) {
    const { log, guide: { guide } } = ctx;
    const tspec = {
        transform: []
    };
    // TODO: parameterize
    const defkind = 'openapi';
    const transformNames = guide.control.transform[defkind].order
        .split(/\s*,\s*/)
        .map((t) => t.trim())
        .filter((t) => '' != t);
    log.info({ what: 'transform', order: transformNames });
    for (const tn of transformNames) {
        log.debug({ what: 'transform', transform: tn });
        const transform = await resolveTransform(tn, ctx);
        tspec.transform.push(transform);
    }
    return tspec;
}
async function resolveTransform(tn, ctx) {
    const { log, defpath, guide: { guide } } = ctx;
    let transform = TRANSFORM[tn];
    if (transform) {
        return transform;
    }
    const tdef = guide.transform[tn];
    if (null == tdef) {
        const err = new Error('Unknown transform: ' + tn);
        log.error({ what: 'transform', transform: tn, fail: 'unknown', err });
        throw err;
    }
    if (!tn.startsWith('custom')) {
        const err = new Error('Custom transform name must start with "custom": ' + tn);
        log.error({ what: 'transform', transform: tn, fail: 'prefix', err });
        throw err;
    }
    const customtpath = node_path_1.default.join(defpath, tdef.load);
    try {
        const transformModule = require(customtpath);
        transform = transformModule[tn];
    }
    catch (e) {
        const err = new Error('Custom transform not found: ' +
            customtpath + ': ' + e.message);
        log.error({ what: 'transform', transform: tn, fail: 'require', err });
        throw err;
    }
    return transform;
}
async function processTransforms(ctx, spec, model, def) {
    const pres = {
        ok: true,
        msg: '',
        results: []
    };
    for (let tI = 0; tI < spec.transform.length; tI++) {
        const transform = spec.transform[tI];
        try {
            const tres = await transform(ctx, spec, model, def);
            pres.ok = pres.ok && tres.ok;
            pres.msg += tres.msg + '\n';
            pres.results.push(tres);
        }
        catch (err) {
            pres.ok = false;
            pres.msg += err.message + '\n';
            pres.results.push({
                ok: false,
                msg: err.message
            });
        }
    }
    return pres;
}
/*
function extractFields(properties: any) {
  const fieldMap = each(properties)
    .reduce((a: any, p: any) => (a[p.key$] =
      { name: p.key$, kind: camelify(p.type) }, a), {})
  return fieldMap
}
*/
function fixName(base, name, prop = 'name') {
    base[prop.toLowerCase()] = name.toLowerCase();
    base[(0, jostraca_1.camelify)(prop)] = (0, jostraca_1.camelify)(name);
    base[prop.toUpperCase()] = name.toUpperCase();
}
//# sourceMappingURL=transform.js.map