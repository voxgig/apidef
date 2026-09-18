"use strict";
/* Copyright (c) 2024-2026 Voxgig Ltd, MIT License */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const node_assert_1 = __importDefault(require("node:assert"));
const apidef_1 = require("../dist/apidef");
// See docs/design/derived-names.md
async function paths(spec) {
    const def = await (0, apidef_1.parse)('OpenAPI', JSON.stringify(spec), { file: 'test.json' });
    return Object.keys(def.paths);
}
function spec(pathmap) {
    return { openapi: '3.0.0', info: { title: 't', version: '1' }, paths: pathmap };
}
(0, node_test_1.describe)('colon-path-params', () => {
    (0, node_test_1.test)('rewrites a declared colon parameter to brace form', async () => {
        node_assert_1.default.deepEqual(await paths(spec({
            '/pwa/v3/projects/:project_slug/email_templates': {
                parameters: [{ in: 'path', name: 'project_slug', required: true }],
                get: { responses: {} },
            },
        })), ['/pwa/v3/projects/{project_slug}/email_templates']);
    });
    (0, node_test_1.test)('takes the declaration from the operation, not just the path item', async () => {
        node_assert_1.default.deepEqual(await paths(spec({
            '/projects/:slug/envs/:env': {
                get: {
                    parameters: [{ in: 'path', name: 'slug' }, { in: 'path', name: 'env' }],
                    responses: {},
                },
            },
        })), ['/projects/{slug}/envs/{env}']);
    });
    (0, node_test_1.test)('leaves a Google-style custom method alone', async () => {
        // `:activate` is part of the resource name and no such parameter is
        // declared, so rewriting it would invent a parameter the API has not got.
        node_assert_1.default.deepEqual(await paths(spec({
            '/users/{id}:activate': {
                post: { parameters: [{ in: 'path', name: 'id' }], responses: {} },
            },
        })), ['/users/{id}:activate']);
    });
    (0, node_test_1.test)('leaves an undeclared colon segment alone', async () => {
        node_assert_1.default.deepEqual(await paths(spec({
            '/reports/:latest': { get: { responses: {} } },
        })), ['/reports/:latest']);
    });
    (0, node_test_1.test)('does not disturb paths that already use brace form', async () => {
        node_assert_1.default.deepEqual(await paths(spec({
            '/users/{id}': { get: { parameters: [{ in: 'path', name: 'id' }], responses: {} } },
            '/plain/path': { get: { responses: {} } },
        })), ['/users/{id}', '/plain/path']);
    });
    (0, node_test_1.test)('a query parameter of the same name does not count', async () => {
        // Only `in: path` declares a path parameter; a query parameter that
        // happens to share the name says nothing about the URL's shape.
        node_assert_1.default.deepEqual(await paths(spec({
            '/search/:mode': { get: { parameters: [{ in: 'query', name: 'mode' }], responses: {} } },
        })), ['/search/:mode']);
    });
});
//# sourceMappingURL=colon-path-params.test.js.map