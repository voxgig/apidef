"use strict";
/* Copyright (c) 2024-2025 Voxgig, MIT License */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveElements = resolveElements;
const node_path_1 = __importDefault(require("node:path"));
async function resolveElements(ctx, kind, subkind, standard) {
    const { log, model, guide } = ctx;
    // TODO: model access should be via a utility that generates
    // useful errors when the target is missing
    const control = guide.control[kind][subkind];
    const target = kind + '.' + subkind;
    const elementNames = control.order
        .split(/\s*,\s*/)
        .map((t) => t.trim())
        .filter((elem) => '' != elem);
    log.info({
        point: 'element', note: target + ': order: ' + elementNames.join(';'),
        order: elementNames
    });
    const elementResults = [];
    for (const en of elementNames) {
        log.debug({ point: 'element', note: target + ': ' + en });
        const element = await resolveElement(en, control, target, standard, ctx);
        const result = await element(ctx);
        elementResults.push(result);
    }
    return elementResults;
}
async function resolveElement(en, control, target, standard, ctx) {
    const { log } = ctx;
    let element = standard[en];
    if (element) {
        return element;
    }
    const elemdef = control.element[en];
    if (null == elemdef) {
        const err = new Error('Unknown element: ' + en);
        log.error({ what: 'element', element: target + ': ' + en, fail: 'unknown', err });
        throw err;
    }
    if (!en.startsWith('custom')) {
        const err = new Error('Custom element name must start with "custom": ' + en);
        log.error({ what: 'element', element: target + ': ' + en, fail: 'prefix', err });
        throw err;
    }
    const customtpath = node_path_1.default.join(ctx.defpath, elemdef.load);
    try {
        const elementModule = require(customtpath);
        element = elementModule[en];
    }
    catch (e) {
        const err = new Error('Custom element not found: ' +
            customtpath + ': ' + e.message);
        log.error({ what: 'element', element: target + ': ' + en, fail: 'require', err });
        throw err;
    }
    return element;
}
//# sourceMappingURL=resolver.js.map