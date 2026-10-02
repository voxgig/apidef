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
const parse_1 = require("../../dist/parse");
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
(0, node_test_1.describe)('transform-top security', () => {
    const CF_SCHEMES = {
        api_email: { type: 'apiKey', in: 'header', name: 'X-Auth-Email' },
        api_key: { type: 'apiKey', in: 'header', name: 'X-Auth-Key' },
        api_token: { type: 'http', scheme: 'bearer' },
    };
    (0, node_test_1.test)('a first entry needing a scheme set gives way to a single scheme', async () => {
        const ctx = makeCtx({
            info: {},
            security: [{ api_email: [], api_key: [] }, { api_token: [] }],
            paths: { '/zones': { get: {} } },
            components: { securitySchemes: CF_SCHEMES },
        });
        await (0, top_1.topTransform)(ctx);
        const security = ctx.apimodel.main[types_1.KIT].info.security;
        node_assert_1.default.deepStrictEqual([security.scheme, security.in, security.name, security.prefix], ['api_token', 'header', 'Authorization', 'Bearer']);
        node_assert_1.default.deepStrictEqual(security.alternatives.map((set) => set.map((s) => s.name)), [['X-Auth-Email', 'X-Auth-Key']]);
    });
    (0, node_test_1.test)('the scheme every operation names first outranks the definition', async () => {
        const ops = { security: [{ api_token: [] }, { api_email: [], api_key: [] }] };
        const ctx = makeCtx({
            info: {},
            security: [{ api_email: [] }],
            paths: { '/zones': { get: ops, post: ops } },
            components: { securitySchemes: CF_SCHEMES },
        });
        await (0, top_1.topTransform)(ctx);
        const security = ctx.apimodel.main[types_1.KIT].info.security;
        node_assert_1.default.strictEqual(security.scheme, 'api_token');
        node_assert_1.default.deepStrictEqual(security.alternatives.map((set) => set.map((s) => s.scheme)), [['api_email', 'api_key']]);
    });
    (0, node_test_1.test)('a declared scheme no operation applies is still the credential', async () => {
        const ctx = makeCtx({
            info: {},
            paths: { '/api/gettext': { get: {} } },
            components: {
                securitySchemes: {
                    ApiKeyAuth: { type: 'apiKey', in: 'query', name: 'apikey' },
                    SubscriberAuth: { type: 'http', scheme: 'basic' },
                },
            },
        });
        await (0, top_1.topTransform)(ctx);
        const info = ctx.apimodel.main[types_1.KIT].info;
        node_assert_1.default.strictEqual(info.auth, undefined);
        node_assert_1.default.deepStrictEqual(info.security, {
            scheme: 'ApiKeyAuth', type: 'apiKey', in: 'query', name: 'apikey', prefix: '',
        });
    });
    (0, node_test_1.test)('a definition declaring no auth is public', async () => {
        const ctx = makeCtx({ info: {}, paths: { '/x': { get: {} } } });
        await (0, top_1.topTransform)(ctx);
        const info = ctx.apimodel.main[types_1.KIT].info;
        node_assert_1.default.strictEqual(info.auth, false);
        node_assert_1.default.strictEqual(info.security, undefined);
    });
    (0, node_test_1.test)('the token exchange sits beside the chosen scheme', async () => {
        const def = {
            info: { title: 'T' },
            security: [{ bearerAuth: [] }],
            paths: {
                '/auth/token': {
                    post: {
                        security: [],
                        responses: {
                            200: {
                                content: {
                                    'application/json': {
                                        schema: { type: 'object', properties: { access_token: { type: 'string' } } },
                                    },
                                },
                            },
                        },
                    },
                },
            },
            components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } } },
        };
        const ctx = makeCtx(def);
        await (0, top_1.topTransform)(ctx);
        node_assert_1.default.deepStrictEqual(ctx.apimodel.main[types_1.KIT].info.security, {
            scheme: 'bearerAuth', type: 'http', in: 'header', name: 'Authorization', prefix: 'Bearer',
            exchange: { path: 'auth/token', method: 'POST', response: 'access_token' },
        });
        node_assert_1.default.deepStrictEqual(Object.keys(def.info), ['title']);
    });
    (0, node_test_1.test)('the fallback is the first scheme the parsed source declares', async () => {
        const def = await (0, parse_1.parse)('OpenAPI', JSON.stringify({
            openapi: '3.0.0', info: { title: 't', version: '1' },
            paths: { '/x': { get: { responses: { 200: { description: 'ok' } } } } },
            components: {
                securitySchemes: {
                    zeta: { type: 'http', scheme: 'bearer' },
                    alpha: { type: 'apiKey', in: 'query', name: 'k' },
                },
            },
        }), { file: 'order.json' });
        const ctx = makeCtx(def);
        await (0, top_1.topTransform)(ctx);
        node_assert_1.default.strictEqual(ctx.apimodel.main[types_1.KIT].info.security.scheme, 'zeta');
    });
    const graphqlInfo = async (auth) => {
        const ctx = makeCtx({
            graphql: true, info: { title: 'G' }, servers: [{ url: 'https://g.example/graphql' }],
        });
        if (undefined !== auth)
            ctx.opts = { auth };
        await (0, top_1.topTransform)(ctx);
        return ctx.apimodel.main[types_1.KIT].info;
    };
    (0, node_test_1.test)('a GraphQL schema leaves auth unset without the auth option', async () => {
        const info = await graphqlInfo();
        node_assert_1.default.strictEqual(info.auth, undefined);
        node_assert_1.default.strictEqual(info.security, undefined);
    });
    (0, node_test_1.test)('a GraphQL auth option marks the API public or describes its credential', async () => {
        const off = await graphqlInfo({ active: false });
        node_assert_1.default.strictEqual(off.auth, false);
        node_assert_1.default.strictEqual(off.security, undefined);
        const on = await graphqlInfo({ name: 'X-Key' });
        node_assert_1.default.strictEqual(on.auth, undefined);
        node_assert_1.default.deepStrictEqual(on.security, {
            scheme: 'apikey', type: 'apiKey', in: 'header', name: 'X-Key', prefix: '',
        });
    });
});
//# sourceMappingURL=top.test.js.map