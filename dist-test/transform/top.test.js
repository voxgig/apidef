"use strict";
/* Copyright (c) 2024-2026 Voxgig Ltd, MIT License */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const node_assert_1 = __importDefault(require("node:assert"));
const top_1 = require("../../dist/transform/top");
const types_1 = require("../../dist/types");
function makeCtx(def) {
    return {
        apimodel: { main: { [types_1.KIT]: {} } },
        def,
        log: { info: () => { }, debug: () => { }, warn: () => { } },
    };
}
(0, node_test_1.describe)('transform-top servers[].url scheme normalisation', () => {
    (0, node_test_1.test)('passes through already-schemed URLs', async () => {
        const ctx = makeCtx({ info: {}, servers: [{ url: 'https://api.example.com/v1' }] });
        await (0, top_1.topTransform)(ctx);
        node_assert_1.default.deepStrictEqual(ctx.apimodel.main[types_1.KIT].info.servers[0].url, 'https://api.example.com/v1');
    });
    (0, node_test_1.test)('prepends https:// when scheme is missing', async () => {
        const ctx = makeCtx({ info: {}, servers: [{ url: 'api.artic.edu/api/v1' }] });
        await (0, top_1.topTransform)(ctx);
        node_assert_1.default.deepStrictEqual(ctx.apimodel.main[types_1.KIT].info.servers[0].url, 'https://api.artic.edu/api/v1');
    });
    (0, node_test_1.test)('preserves http:// when explicitly specified', async () => {
        const ctx = makeCtx({ info: {}, servers: [{ url: 'http://insecure.example/x' }] });
        await (0, top_1.topTransform)(ctx);
        node_assert_1.default.deepStrictEqual(ctx.apimodel.main[types_1.KIT].info.servers[0].url, 'http://insecure.example/x');
    });
    (0, node_test_1.test)('leaves relative URLs alone', async () => {
        // Relative server URLs (path-only) are valid per OpenAPI and mean
        // "same host as where the spec is served". Adding https:// would
        // turn `/v1` into `https:///v1` which is wrong.
        const ctx = makeCtx({ info: {}, servers: [{ url: '/v1' }] });
        await (0, top_1.topTransform)(ctx);
        node_assert_1.default.deepStrictEqual(ctx.apimodel.main[types_1.KIT].info.servers[0].url, '/v1');
    });
    (0, node_test_1.test)('strips leading slash duplicates when prepending', async () => {
        const ctx = makeCtx({ info: {}, servers: [{ url: '//api.example/v1' }] });
        await (0, top_1.topTransform)(ctx);
        node_assert_1.default.deepStrictEqual(ctx.apimodel.main[types_1.KIT].info.servers[0].url, 'https://api.example/v1');
    });
    (0, node_test_1.test)('normalises every entry when multiple servers are listed', async () => {
        const ctx = makeCtx({
            info: {},
            servers: [
                { url: 'api.a/v1' },
                { url: 'https://api.b/v1' },
                { url: 'api.c/v1' },
            ],
        });
        await (0, top_1.topTransform)(ctx);
        const urls = ctx.apimodel.main[types_1.KIT].info.servers.map((s) => s.url);
        node_assert_1.default.deepStrictEqual(urls, [
            'https://api.a/v1',
            'https://api.b/v1',
            'https://api.c/v1',
        ]);
    });
});
//# sourceMappingURL=top.test.js.map