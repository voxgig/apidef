"use strict";
/* Copyright (c) 2024 Voxgig, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.parse = parse;
const openapi_core_1 = require("@redocly/openapi-core");
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
    const config = await (0, openapi_core_1.createConfig)(meta?.config || {});
    let bundle;
    bundle = await (0, openapi_core_1.bundleFromString)({
        source,
        config,
        dereference: true,
    });
    const def = bundle.bundle.parsed;
    return def;
}
//# sourceMappingURL=parse.js.map