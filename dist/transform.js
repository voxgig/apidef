"use strict";
/* Copyright (c) 2024 Voxgig, MIT License */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GuideShape = exports.OPKIND = void 0;
exports.fixName = fixName;
exports.resolveTransforms = resolveTransforms;
exports.processTransforms = processTransforms;
const node_path_1 = __importDefault(require("node:path"));
const jostraca_1 = require("jostraca");
const gubu_1 = require("gubu");
const top_1 = require("./transform/top");
const entity_1 = require("./transform/entity");
const operation_1 = require("./transform/operation");
const field_1 = require("./transform/field");
const TRANSFORM = {
    top: top_1.topTransform,
    entity: entity_1.entityTransform,
    operation: operation_1.operationTransform,
    field: field_1.fieldTransform,
    // manual: manualTransform,
};
const OPKIND = {
    list: 'res',
    load: 'res',
    remove: 'res',
    create: 'req',
    update: 'req',
};
exports.OPKIND = OPKIND;
const GuideShape = (0, gubu_1.Gubu)({
    entity: {},
    control: {},
    transform: {},
    manual: {},
});
exports.GuideShape = GuideShape;
async function resolveTransforms(ctx) {
    const { log, model: { main: { api: { guide } } } } = ctx;
    const tspec = {
        transform: []
    };
    // TODO: parameterize
    const defkind = 'openapi';
    const transformNames = guide.control.transform[defkind].order
        .split(/\s*,\s*/)
        .map((t) => t.trim())
        .filter((t) => '' != t);
    log.info({
        point: 'transform', note: 'order: ' + transformNames.join(';'),
        order: transformNames
    });
    try {
        for (const tn of transformNames) {
            log.debug({ what: 'transform', transform: tn, note: tn });
            const transform = await resolveTransform(tn, ctx);
            tspec.transform.push(transform);
        }
    }
    catch (err) {
        console.log(err);
        throw err;
    }
    return tspec;
}
async function resolveTransform(tn, ctx) {
    const { log, defpath, model: { main: { api: { guide } } } } = ctx;
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
async function processTransforms(ctx, 
// spec: TransformSpec,
transforms, apimodel, def) {
    const pres = {
        ok: true,
        msg: '',
        results: []
    };
    const guide = GuideShape(ctx.model.main.api.guide);
    // for (let tI = 0; tI < spec.transform.length; tI++) {
    //  const transform = spec.transform[tI]
    for (let tI = 0; tI < transforms.length; tI++) {
        const transform = transforms[tI];
        try {
            const tres = await transform(ctx, guide, apimodel, def);
            pres.ok = pres.ok && tres.ok;
            pres.results.push(tres);
        }
        catch (err) {
            // TODO: fix: this error does not get printed
            console.log(err);
            pres.ok = false;
            pres.msg += transform.name + ': ' + err.message + '\n';
            pres.results.push({
                ok: false,
                msg: err.message,
                err,
                transform
            });
        }
    }
    return pres;
}
function fixName(base, name, prop = 'name') {
    base[prop.toLowerCase()] = name.toLowerCase();
    base[(0, jostraca_1.camelify)(prop)] = (0, jostraca_1.camelify)(name);
    base[prop.toUpperCase()] = name.toUpperCase();
}
//# sourceMappingURL=transform.js.map