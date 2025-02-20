"use strict";
/* Copyright (c) 2024 Voxgig, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.parse = parse;
const openapi_core_1 = require("@redocly/openapi-core");
async function parse(kind, source) {
    if ('OpenAPI' === kind) {
        return parseOpenAPI(source);
    }
    else {
        throw new Error('@voxgig/apidef-parse: unknown kind: ' + kind);
    }
}
async function parseOpenAPI(source) {
    const config = await (0, openapi_core_1.createConfig)({});
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