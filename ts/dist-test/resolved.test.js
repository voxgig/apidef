"use strict";
/* Copyright (c) 2024-2026 Voxgig Ltd, MIT License */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const node_assert_1 = __importDefault(require("node:assert"));
const apidef_1 = require("../dist/apidef");
const contract_1 = require("../dist/transform/contract");
const resolved_1 = require("../dist/resolved");
const SPEC = {
    openapi: '3.0.0',
    info: { title: 't', version: '1' },
    security: [{ apiKeyAuth: [] }],
    components: { securitySchemes: { apiKeyAuth: { type: 'http', scheme: 'bearer' } } },
    paths: {
        '/things/{id}': {
            parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
            get: {
                operationId: 'getThing',
                parameters: [{ in: 'query', name: 'expand', schema: { type: 'string' } }],
                responses: { 200: { description: 'ok' } },
            },
            delete: { security: [], responses: { 204: { description: 'gone' } } },
        },
        '/open': { get: { responses: { 200: { description: 'ok' } } } },
    },
};
(0, node_test_1.describe)('resolved', () => {
    (0, node_test_1.test)('merges path-level and operation-level parameters', () => {
        const facts = (0, resolved_1.operationFacts)(SPEC, { method: 'GET', orig: '/things/{id}' });
        node_assert_1.default.deepEqual(facts.parameters.map((p) => p.name), ['id', 'expand']);
    });
    (0, node_test_1.test)('defaults security from the document and says where it came from', () => {
        const get = (0, resolved_1.operationFacts)(SPEC, { method: 'GET', orig: '/things/{id}' });
        node_assert_1.default.deepEqual(get.security, [{ apiKeyAuth: [] }]);
        node_assert_1.default.equal(get.securitySource, 'definition');
        // An operation that overrides with [] needs NO auth — a distinction the
        // model's single resolved `kit.info.security` cannot express.
        const del = (0, resolved_1.operationFacts)(SPEC, { method: 'DELETE', orig: '/things/{id}' });
        node_assert_1.default.deepEqual(del.security, []);
        node_assert_1.default.equal(del.securitySource, 'operation');
    });
    (0, node_test_1.test)('carries securitySchemes under either specification spelling', () => {
        const oas3 = (0, resolved_1.operationFacts)(SPEC, { method: 'GET', orig: '/open' });
        node_assert_1.default.deepEqual(Object.keys(oas3.securitySchemes), ['apiKeyAuth']);
        const swagger2 = (0, resolved_1.operationFacts)({
            swagger: '2.0',
            securityDefinitions: { basic: { type: 'basic' } },
            paths: { '/x': { get: { responses: {} } } },
        }, { method: 'GET', orig: '/x' });
        node_assert_1.default.deepEqual(Object.keys(swagger2.securitySchemes), ['basic']);
    });
    (0, node_test_1.test)('is undefined for an operation the definition does not describe', () => {
        node_assert_1.default.equal((0, resolved_1.operationFacts)(SPEC, { method: 'PUT', orig: '/things/{id}' }), undefined);
        node_assert_1.default.equal((0, resolved_1.operationFacts)(SPEC, { method: 'GET', orig: '/nope' }), undefined);
    });
    (0, node_test_1.test)('indexes every described operation by method and path', () => {
        node_assert_1.default.deepEqual(Object.keys((0, resolved_1.operationIndex)(SPEC)).sort(), ['DELETE /things/{id}', 'GET /open', 'GET /things/{id}']);
    });
    (0, node_test_1.test)('publishes onto the shared build context, and reads back', () => {
        const buildctx = { step: 'pre', state: {} };
        (0, resolved_1.publishResolved)(buildctx, 'openapi3', SPEC);
        // @voxgig/model mutates step on ONE context object, so what the pre step
        // publishes is what the post step reads.
        buildctx.step = 'post';
        const back = (0, resolved_1.resolvedSpec)(buildctx);
        node_assert_1.default.equal(back?.kind, 'openapi3');
        node_assert_1.default.equal(back?.operation('GET', '/things/{id}')?.operationId, 'getThing');
    });
    (0, node_test_1.test)('publishing without a build context still returns the capability', () => {
        // apidef also runs outside a model build.
        const r = (0, resolved_1.publishResolved)(undefined, 'openapi3', SPEC);
        node_assert_1.default.equal(r.operation('GET', '/open')?.protocol, 'http');
        node_assert_1.default.equal((0, resolved_1.resolvedSpec)(undefined), undefined);
    });
    (0, node_test_1.test)('the definition it carries is the PARSED one, not the file', async () => {
        // A colon-style path is normalised during parse; a consumer reading the
        // raw file would miss every lookup on such a specification.
        const raw = JSON.stringify({
            openapi: '3.0.0', info: { title: 't', version: '1' },
            paths: {
                '/projects/:slug': {
                    get: { parameters: [{ in: 'path', name: 'slug' }], responses: {} },
                },
            },
        });
        const def = await (0, apidef_1.parse)('OpenAPI', raw, { file: 'test.json' });
        const r = (0, resolved_1.makeResolved)('openapi3', def);
        node_assert_1.default.equal(r.operation('GET', '/projects/{slug}')?.protocol, 'http');
        node_assert_1.default.equal(r.operation('GET', '/projects/:slug'), undefined);
    });
});
// The guide's hint, not a specification fact, so it must survive on the point.
(0, node_test_1.describe)('live-hint-on-point', () => {
    (0, node_test_1.test)('a guide live hint lands on the point, not only in the contract', async () => {
        const point = { method: 'GET', orig: '/things', kind: 'http' };
        const ctx = {
            def: { paths: { '/things': { get: { responses: {} } } } },
            apimodel: { main: { kit: { entity: { thing: { name: 'thing',
                                op: { list: { name: 'list', points: [point] } } } } } } },
            guide: { entity: { thing: { path: { '/things': { op: { list: { live: true } } } } } } },
        };
        await (0, contract_1.contractTransform)(ctx);
        node_assert_1.default.equal(point.live, true);
        // The contract carries only its identity now; the serialised copy of the
        // facts is opt-in.
        node_assert_1.default.equal(point.contract.json, undefined);
        node_assert_1.default.equal(point.contract.id, 'GET /things');
    });
    (0, node_test_1.test)('no hint leaves the point alone', async () => {
        const point = { method: 'GET', orig: '/things', kind: 'http' };
        const ctx = {
            def: { paths: { '/things': { get: { responses: {} } } } },
            apimodel: { main: { kit: { entity: { thing: { name: 'thing',
                                op: { list: { name: 'list', points: [point] } } } } } } },
            guide: {},
        };
        await (0, contract_1.contractTransform)(ctx);
        node_assert_1.default.equal(point.live, undefined);
    });
});
//# sourceMappingURL=resolved.test.js.map