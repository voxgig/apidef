"use strict";
/* Copyright (c) 2024-2025 Voxgig, MIT License */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parse = parse;
const openapi_core_1 = require("@redocly/openapi-core");
const decircular_1 = __importDefault(require("decircular"));
// Parse an API definition source into a JSON sructure.
async function parse(kind, source, meta) {
    if ('OpenAPI' === kind) {
        return parseOpenAPI(source, meta);
    }
    else {
        throw new Error('@voxgig/apidef-parse: unknown kind: ' + kind);
    }
}
async function parseOpenAPI(source, meta) {
    const base = meta?.config || {};
    const config = await (0, openapi_core_1.createConfig)(base);
    // First pass: parse without dereferencing to preserve $refs
    const bundleWithRefs = await (0, openapi_core_1.bundleFromString)({
        source,
        config,
        dereference: false,
    });
    // console.log('Circular-parseOpenAPI')
    // console.log(JSON.stringify(decircular(bundleWithRefs.bundle.parsed), null, 2))
    // Walk the tree and add x-ref properties
    const seen = new WeakSet();
    let refCount = 0;
    function addXRefs(obj, path = '') {
        if (!obj || typeof obj !== 'object' || seen.has(obj))
            return;
        seen.add(obj);
        if (Array.isArray(obj)) {
            obj.forEach((item, index) => addXRefs(item, `${path}[${index}]`));
        }
        else {
            // Check for $ref property
            if (obj.$ref && typeof obj.$ref === 'string') {
                obj['x-ref'] = obj.$ref;
                refCount++;
            }
            // Recursively process all properties
            for (const [key, value] of Object.entries(obj)) {
                if (value && typeof value === 'object') {
                    addXRefs(value, path ? `${path}.${key}` : key);
                }
            }
        }
    }
    addXRefs(bundleWithRefs.bundle.parsed);
    // console.log('Circular-addXRefs')
    // console.log(JSON.stringify(decircular(bundleWithRefs.bundle.parsed), null, 2))
    // Serialize back to string with x-refs preserved
    const sourceWithXRefs = JSON.stringify((0, decircular_1.default)(bundleWithRefs.bundle.parsed));
    // Second pass: parse with dereferencing
    const bundle = await (0, openapi_core_1.bundleFromString)({
        source: sourceWithXRefs,
        // source,
        config,
        dereference: true,
    });
    const def = (0, decircular_1.default)(bundle.bundle.parsed);
    // console.log('Circular-done')
    // console.log(JSON.stringify(def, null, 2))
    return def;
}
//# sourceMappingURL=parse.js.map