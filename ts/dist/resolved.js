"use strict";
/* Copyright (c) 2024-2026 Voxgig Ltd, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.METHODS = void 0;
exports.operationFacts = operationFacts;
exports.operationIndex = operationIndex;
exports.makeResolved = makeResolved;
exports.publishResolved = publishResolved;
exports.resolvedSpec = resolvedSpec;
// See docs/design/resolved-spec-capability.md
const contract_1 = require("./transform/contract");
const METHODS = [
    'get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'
];
exports.METHODS = METHODS;
// The single definition of a resolved operation, shared by contractTransform
// and by consumers of the capability, so the two cannot disagree.
function operationFacts(def, point) {
    const path = def?.paths?.[point.orig];
    const method = path?.[String(point.method).toLowerCase()];
    const graphql = def?.query?.[point.orig] || def?.mutation?.[point.orig];
    if (!method && !graphql)
        return undefined;
    const facts = { protocol: graphql ? 'graphql' : 'http' };
    if (graphql) {
        facts.field = graphql;
        facts.types = (0, contract_1.graphqlInputTypes)(graphql, def.types || {});
        facts.typesScope = 'inputs';
        return facts;
    }
    for (const key of ['operationId', 'requestBody', 'responses', 'consumes', 'produces']) {
        if (undefined !== method[key])
            facts[key] = method[key];
    }
    // A path item may declare parameters shared by every operation under it.
    facts.parameters = [...(path.parameters || []), ...(method.parameters || [])];
    facts.security = method.security ?? def.security;
    facts.securitySource = method.security !== undefined ? 'operation' :
        def.security !== undefined ? 'definition' : 'unspecified';
    // swagger2 names this `securityDefinitions`.
    facts.securitySchemes = def.components?.securitySchemes ?? def.securityDefinitions;
    facts.consumes ??= def.consumes;
    facts.produces ??= def.produces;
    return facts;
}
// Every described operation, keyed 'METHOD path' as `point.contract.id` is.
function operationIndex(def) {
    const out = {};
    for (const path of Object.keys(def?.paths || {})) {
        for (const method of METHODS) {
            if (null == def.paths[path]?.[method])
                continue;
            const facts = operationFacts(def, { method, orig: path });
            if (facts)
                out[method.toUpperCase() + ' ' + path] = facts;
        }
    }
    for (const kind of ['query', 'mutation']) {
        for (const field of Object.keys(def?.[kind] || {})) {
            const facts = operationFacts(def, { method: 'POST', orig: field });
            if (facts)
                out['POST ' + field] = facts;
        }
    }
    return out;
}
function makeResolved(kind, def) {
    return {
        version: 1,
        kind,
        def,
        operation: (method, path) => operationFacts(def, { method, orig: path }),
    };
}
// Tolerates a missing context: apidef also runs outside a model build.
function publishResolved(ctx, kind, def) {
    const resolved = makeResolved(kind, def);
    if (null != ctx && 'object' === typeof ctx) {
        ctx.state = ctx.state || {};
        ctx.state.apidef = { ...(ctx.state.apidef || {}), resolved };
    }
    return resolved;
}
function resolvedSpec(carrier) {
    if (null == carrier || 'object' !== typeof carrier)
        return undefined;
    return carrier.state?.apidef?.resolved ??
        carrier.ctx?.state?.apidef?.resolved ??
        carrier.apidef?.resolved ??
        undefined;
}
//# sourceMappingURL=resolved.js.map