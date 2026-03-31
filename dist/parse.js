"use strict";
/* Copyright (c) 2024-2025 Voxgig, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.parse = parse;
const jsonic_1 = require("jsonic");
const yaml_1 = require("@jsonic/yaml");
const util_1 = require("@voxgig/util");
const utility_1 = require("./utility");
const yamlParser = jsonic_1.Jsonic.make().use(yaml_1.Yaml);
// Matches any line that is not purely a YAML comment or whitespace.
const RE_HAS_CONTENT = /^\s*[^#\s]/m;
// Parse an API definition source into a JSON sructure.
async function parse(kind, source, meta) {
    if ('OpenAPI' === kind) {
        validateSource(kind, source, meta);
        try {
            const def = await parseOpenAPI(source, meta);
            return def;
        }
        catch (pe) {
            if (pe.originalError) {
                pe.originalError.message =
                    `@voxgig/apidef: parse: syntax: ${pe.originalError.message}` +
                        ` (${(0, utility_1.relativizePath)(meta.file)})`;
                pe = pe.originalError;
            }
            else if (pe.code && pe.code.startsWith('jsonic')) {
                pe.message =
                    `@voxgig/apidef: parse: syntax: ${pe.message}` +
                        ` (${(0, utility_1.relativizePath)(meta.file)})`;
            }
            else {
                pe.message =
                    `@voxgig/apidef: parse: internal: ${pe.message}` +
                        ` (${(0, utility_1.relativizePath)(meta.file)})`;
            }
            throw pe;
        }
    }
    else {
        throw new Error(`@voxgig/apidef: parse: unknown kind: ${kind}` +
            ` (${(0, utility_1.relativizePath)(meta.file)})`);
    }
}
async function parseOpenAPI(source, _meta) {
    let parsed;
    try {
        parsed = yamlParser(source);
    }
    catch (err) {
        // Rethrow jsonic parse errors with context
        throw err;
    }
    // Validate parsed result is a non-null object
    if (null == parsed || 'object' !== typeof parsed || Array.isArray(parsed)) {
        throw new Error(`@voxgig/apidef: parse: JSON/YAML source must be an object`);
    }
    // Validate it's an OpenAPI or Swagger spec
    if (!parsed.openapi && !parsed.swagger) {
        throw new Error(`@voxgig/apidef: parse: Unsupported OpenAPI version: undefined`);
    }
    // Ensure components exists (Redocly used to add this automatically)
    if (null == parsed.components) {
        parsed.components = {};
    }
    // Single-pass: add x-ref properties and resolve $ref pointers together.
    addXRefsAndResolve(parsed, parsed);
    const def = (0, util_1.decircular)(parsed);
    return def;
}
// Single-pass tree walk that:
// 1. Preserves original $ref values as x-ref
// 2. Resolves $ref JSON pointers in-place
function addXRefsAndResolve(obj, root, visited) {
    if (!obj || typeof obj !== 'object')
        return;
    if (!visited)
        visited = new WeakSet();
    if (visited.has(obj))
        return;
    visited.add(obj);
    if (Array.isArray(obj)) {
        for (let i = 0; i < obj.length; i++) {
            const item = obj[i];
            if (item && typeof item === 'object') {
                if (typeof item.$ref === 'string') {
                    const xref = item.$ref;
                    const resolved = resolvePointer(root, xref);
                    if (resolved !== undefined) {
                        obj[i] = { ...resolved, 'x-ref': xref };
                        addXRefsAndResolve(obj[i], root, visited);
                    }
                    else {
                        item['x-ref'] = xref;
                        addXRefsAndResolve(item, root, visited);
                    }
                }
                else {
                    addXRefsAndResolve(item, root, visited);
                }
            }
        }
    }
    else {
        for (const key of Object.keys(obj)) {
            const val = obj[key];
            if (val && typeof val === 'object') {
                if (typeof val.$ref === 'string') {
                    const xref = val.$ref;
                    const resolved = resolvePointer(root, xref);
                    if (resolved !== undefined) {
                        obj[key] = { ...resolved, 'x-ref': xref };
                        addXRefsAndResolve(obj[key], root, visited);
                    }
                    else {
                        val['x-ref'] = xref;
                        addXRefsAndResolve(val, root, visited);
                    }
                }
                else {
                    addXRefsAndResolve(val, root, visited);
                }
            }
        }
    }
}
// Follow a JSON pointer like "#/components/schemas/Planet"
function resolvePointer(root, ref) {
    if (!ref.startsWith('#/'))
        return undefined;
    const parts = ref
        .substring(2)
        .split('/')
        .map(p => p.replace(/~1/g, '/').replace(/~0/g, '~'));
    let current = root;
    for (const part of parts) {
        if (current == null || typeof current !== 'object')
            return undefined;
        current = current[part];
    }
    return current;
}
function validateSource(kind, source, meta) {
    if (typeof source !== 'string') {
        throw new Error(`@voxgig/apidef: parse: ${kind}: source must be a string` +
            ` (${(0, utility_1.relativizePath)(meta.file)})`);
    }
    // Check if source has any non-comment, non-whitespace content
    // without creating a full string copy.
    if (!RE_HAS_CONTENT.test(source)) {
        throw new Error(`@voxgig/apidef: parse: ${kind}: source is empty` +
            ` (${(0, utility_1.relativizePath)(meta.file)})`);
    }
}
//# sourceMappingURL=parse.js.map