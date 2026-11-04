"use strict";
/* Copyright (c) 2026 Voxgig Ltd, MIT License */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const node_assert_1 = __importDefault(require("node:assert"));
const field_1 = require("../dist/transform/field");
// go/field_syn_test.go runs the same cases.
function seg(path) {
    return path.split('/').filter((p) => '' !== p).map((p) => p.startsWith('{') ? { var: p.slice(1, -1) } : { lit: p });
}
function point(m, o, params = [], req) {
    return {
        m, o, s: seg(o),
        g: { params: params.map((n) => ({ n, k: 'param', r: true, t: '`$STRING`' })) },
        ...(null == req ? {} : { t: { req, res: '`body`' } }),
    };
}
const record = (props) => ({ content: { 'application/json': { schema: {
                type: 'object', properties: props,
            } } } });
const tagsBody = { content: { 'application/json': { schema: {
                type: 'array', items: { type: 'string' },
            } } } };
async function fieldsOf(name, op, paths, guide) {
    const ment = { name, fields: {}, op };
    await (0, field_1.fieldTransform)({
        apimodel: { main: { kit: { entity: { [name]: ment } } } },
        def: { paths },
        guide,
    });
    return ment;
}
(0, node_test_1.describe)('field-syn', () => {
    (0, node_test_1.test)('an id added for a composite identity is synthetic', async () => {
        const ment = await fieldsOf('repo', { load: { name: 'load', points: [point('GET', '/repos/{owner}/{repo}', ['owner', 'repo'])] } }, { '/repos/{owner}/{repo}': { get: { responses: { 200: record({ name: { type: 'string' } }) } } } });
        node_assert_1.default.deepStrictEqual(ment.id.parts, ['owner', 'repo']);
        node_assert_1.default.strictEqual(ment.fields.id.syn, true);
        node_assert_1.default.strictEqual(ment.fields.name.syn, undefined);
    });
    (0, node_test_1.test)('an id added for the key the guide leaves when composite is off is synthetic', async () => {
        const ment = await fieldsOf('artifact', { load: { name: 'load', points: [
                    point('GET', '/artifacts/{artifact_id}/{archive_format}', ['artifact_id', 'archive_format'])
                ] } }, { '/artifacts/{artifact_id}/{archive_format}': { get: { responses: { 200: { content: {} } } } } }, { entity: { artifact: { id: { composite: false } } } });
        node_assert_1.default.strictEqual(ment.id.field, 'id');
        node_assert_1.default.strictEqual(ment.fields.id.syn, true);
    });
    (0, node_test_1.test)('an id added for a record addressed by an id parameter is synthetic', async () => {
        const ment = await fieldsOf('secret', { load: { name: 'load', points: [point('GET', '/secrets/{id}', ['id'])] } }, { '/secrets/{id}': { get: { responses: { 200: record({ value: { type: 'string' } }) } } } });
        node_assert_1.default.strictEqual(ment.id.field, 'id');
        node_assert_1.default.strictEqual(ment.fields.id.syn, true);
    });
    (0, node_test_1.test)('an id the record declares is not synthetic', async () => {
        const ment = await fieldsOf('secret', { load: { name: 'load', points: [point('GET', '/secrets/{id}', ['id'])] } }, { '/secrets/{id}': { get: { responses: { 200: record({
                            id: { type: 'string' }, value: { type: 'string' }
                        }) } } } });
        node_assert_1.default.strictEqual(ment.id.field, 'id');
        node_assert_1.default.strictEqual(ment.fields.id.syn, undefined);
    });
    (0, node_test_1.test)('the field an array body is sent from is synthetic', async () => {
        const ment = await fieldsOf('label', { create: { name: 'create', points: [point('POST', '/labels', [], '`reqdata.tags`')] } }, { '/labels': { post: { requestBody: tagsBody, responses: { 201: { content: {} } } } } });
        node_assert_1.default.strictEqual(ment.fields.tags.syn, true);
    });
    (0, node_test_1.test)('a carrier a property also declares is not synthetic', async () => {
        const ment = await fieldsOf('label', {
            create: { name: 'create', points: [point('POST', '/labels', [], '`reqdata.tags`')] },
            list: { name: 'list', points: [point('GET', '/labels')] },
        }, { '/labels': {
                post: { requestBody: tagsBody, responses: { 201: { content: {} } } },
                get: { responses: { 200: { content: { 'application/json': { schema: {
                                        type: 'array', items: { type: 'object', properties: {
                                                name: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } }
                                            } }
                                    } } } } } },
            } });
        node_assert_1.default.strictEqual(ment.fields.tags.syn, undefined);
        node_assert_1.default.strictEqual(ment.fields.name.syn, undefined);
    });
});
//# sourceMappingURL=field-syn.test.js.map