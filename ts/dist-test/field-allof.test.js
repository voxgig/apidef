"use strict";
/* Copyright (c) 2024-2026 Voxgig Ltd, MIT License */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const node_assert_1 = __importDefault(require("node:assert"));
const field_1 = require("../dist/transform/field");
function runFieldTransform(entity, def) {
    const apimodel = { main: { kit: { entity: { [entity.name]: entity } } } };
    return (0, field_1.fieldTransform)({ apimodel, def }).then(() => entity.fields);
}
const json = (schema) => ({ content: { 'application/json': { schema } } });
const prop = (key) => ({ key$: key, type: 'string' });
const props = (...keys) => Object.fromEntries(keys.map((key) => [key, prop(key)]));
// One operation on /jobs, with the response and request schemas given.
function job(opname, method, response, request) {
    const opdef = { responses: { 200: json(response) } };
    if (null != request) {
        opdef.requestBody = json(request);
    }
    return {
        entity: {
            name: 'job',
            fields: {},
            op: { [opname]: { name: opname, points: [{ o: '/jobs', m: method, k: 'json' }] } },
        },
        def: { paths: { '/jobs': { [method.toLowerCase()]: opdef } } },
    };
}
function summary(fields) {
    return Object.keys(fields).sort().map((name) => name + (fields[name].r ? '!' : ''));
}
(0, node_test_1.describe)('field-allof', () => {
    (0, node_test_1.test)('a request schema composed with allOf contributes every member', async () => {
        const { entity, def } = job('create', 'POST', { type: 'object', properties: props('id') }, { allOf: [
                { type: 'object', required: ['url'], properties: props('url') },
                { type: 'object', properties: props('formats') },
            ] });
        node_assert_1.default.deepStrictEqual(summary(await runFieldTransform(entity, def)), ['formats', 'id', 'url!']);
    });
    (0, node_test_1.test)('a response schema composed with allOf keeps its members beside a request body', async () => {
        const { entity, def } = job('create', 'POST', { allOf: [{ type: 'object', properties: props('id', 'status') }] }, { type: 'object', properties: props('url') });
        node_assert_1.default.deepStrictEqual(summary(await runFieldTransform(entity, def)), ['id', 'status', 'url']);
    });
    (0, node_test_1.test)('a nested allOf member contributes its fields', async () => {
        const { entity, def } = job('load', 'GET', { allOf: [
                { allOf: [{ type: 'object', properties: props('id') }] },
                { type: 'object', properties: props('status') },
            ] });
        node_assert_1.default.deepStrictEqual(summary(await runFieldTransform(entity, def)), ['id', 'status']);
    });
    (0, node_test_1.test)('properties and required beside allOf apply to the composed schema', async () => {
        const { entity, def } = job('create', 'POST', { type: 'object', properties: props('id') }, {
            type: 'object',
            required: ['url', 'name'],
            properties: props('name'),
            allOf: [{ type: 'object', properties: props('url', 'formats') }],
        });
        node_assert_1.default.deepStrictEqual(summary(await runFieldTransform(entity, def)), ['formats', 'id', 'name!', 'url!']);
    });
    (0, node_test_1.test)('a name one allOf member requires is required where a sibling declares it', async () => {
        const { entity, def } = job('create', 'POST', { type: 'object', properties: props('id') }, { allOf: [
                { type: 'object', properties: props('url', 'formats') },
                { required: ['url'] },
                { allOf: [{ required: ['formats'] }] },
            ] });
        node_assert_1.default.deepStrictEqual(summary(await runFieldTransform(entity, def)), ['formats!', 'id', 'url!']);
    });
    (0, node_test_1.test)('a property declared beside allOf and in a member is one field with both facts', async () => {
        const { entity, def } = job('load', 'GET', {
            type: 'object',
            properties: { payload: { description: 'What the job carries.' } },
            allOf: [{
                    type: 'object',
                    required: ['payload'],
                    properties: { payload: { type: 'object', format: 'job-payload' } },
                }],
        });
        const { payload } = await runFieldTransform(entity, def);
        node_assert_1.default.deepStrictEqual({ t: payload.t, r: payload.r, sh: payload.sh, fo: payload.fo, op: payload.op }, { t: '`$OBJECT`', r: true, sh: 'What the job carries.', fo: 'job-payload', op: {} });
    });
    (0, node_test_1.test)('a property keeps its union, declared once or beside an annotation', async () => {
        const branch = (key) => ({ type: 'object', properties: { [key]: { type: 'number' } } });
        const union = () => ({ oneOf: [branch('radius'), branch('side')] });
        for (const response of [
            { type: 'object', properties: { id: { type: 'string' }, shape: union() } },
            {
                type: 'object',
                properties: { id: { type: 'string' }, shape: { description: 'One of two shapes.' } },
                allOf: [{ type: 'object', properties: { shape: union() } }],
            },
        ]) {
            const { entity, def } = job('load', 'GET', response);
            const { shape } = await runFieldTransform(entity, def);
            node_assert_1.default.deepStrictEqual({ count: shape.union?.count, branches: shape.union?.branches }, { count: 1, branches: 2 });
        }
    });
    (0, node_test_1.test)('a blank fact in one declaration leaves room for a later one', async () => {
        const { entity, def } = job('load', 'GET', {
            allOf: [
                { type: 'object', properties: { id: { type: 'string' }, notes: { type: 'string', description: ' ', format: '' } } },
                { type: 'object', properties: { notes: { description: 'Free text about the job.', format: 'markdown' } } },
            ],
        });
        const { notes } = await runFieldTransform(entity, def);
        node_assert_1.default.deepStrictEqual({ sh: notes.sh, fo: notes.fo }, { sh: 'Free text about the job.', fo: 'markdown' });
    });
});
//# sourceMappingURL=field-allof.test.js.map