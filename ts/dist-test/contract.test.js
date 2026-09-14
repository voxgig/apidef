"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const contract_1 = require("../dist/transform/contract");
const clean_1 = require("../dist/transform/clean");
for (const method of ['POST', 'QUERY'])
    (0, node_test_1.test)('lossless point contract ' + method, async () => {
        const schema = { type: 'object', additionalProperties: false, properties: {
                n: { type: 'integer', minimum: 1 }, nested: { type: 'array', minItems: 1, items: { oneOf: [{ type: 'string', enum: ['a', 'b'] }, { type: 'null' }] } }, secret: { type: 'string', writeOnly: true }, id: { type: 'string', readOnly: true },
            }, required: ['n'], example: {}, key$: 'internal' };
        const point = { method, orig: '/operation' };
        const ctx = { apimodel: { main: { kit: { entity: { item: { name: 'item', op: { create: { name: 'create', points: [point] } } } } } } }, guide: {}, def: {
                security: [{ bearer: [] }], paths: { '/operation': { [method.toLowerCase()]: {
                            operationId: 'createItem', security: [], requestBody: { required: false, content: { 'application/json': { schema, example: {} } } }, responses: { '201': { content: { 'application/json': { schema } } } },
                        } } },
            } };
        await (0, contract_1.contractTransform)(ctx);
        await (0, clean_1.cleanTransform)(ctx);
        const contract = ctx.apimodel.main.kit.entity.item.op.create.points[0].contract;
        strict_1.default.equal(contract.version, 1);
        strict_1.default.equal(contract.id, method + ' /operation');
        const facts = JSON.parse(contract.json);
        strict_1.default.deepEqual(facts.security, []);
        strict_1.default.deepEqual(facts.requestBody.content['application/json'].example, {});
        strict_1.default.equal(facts.requestBody.content['application/json'].schema.properties.n.type, 'integer');
        strict_1.default.equal(facts.requestBody.content['application/json'].schema.key$, undefined);
        strict_1.default.equal(schema.key$, 'internal', 'Shared schema must stay untouched');
        strict_1.default.deepEqual(facts.requestBody.content['application/json'].schema.properties.n, { minimum: 1, type: 'integer' });
    });
(0, node_test_1.test)('Swagger body, inherited security and guide recipe remain distinct', async () => {
    const point = { method: 'POST', orig: '/item' };
    const ctx = { apimodel: { main: { kit: { entity: { item: { name: 'item', op: { create: { name: 'create', points: [point] } } } } } } }, guide: { entity: { item: { path: { '/item': { op: { create: { live: { input: { n: 2 } }, contract: { security: [] } } } } } } } }, def: { swagger: '2.0', consumes: ['application/json'], security: [{ key: [] }], paths: { '/item': { post: { parameters: [{ in: 'body', schema: { type: 'object' } }] } } } } };
    await (0, contract_1.contractTransform)(ctx);
    const facts = JSON.parse(point.contract.json);
    strict_1.default.equal(point.contract.source, 'swagger2');
    strict_1.default.deepEqual(facts.live.input, { n: 2 });
    strict_1.default.equal(facts.securitySource, 'definition');
    strict_1.default.deepEqual(facts.security, []);
    strict_1.default.equal(facts.factSources.security, 'guide');
    strict_1.default.deepEqual(facts.consumes, ['application/json']);
    strict_1.default.equal(facts.requestBody, undefined);
    strict_1.default.equal(facts.parameters[0].in, 'body');
});
(0, node_test_1.test)('GraphQL query and mutation argument facts survive without HTTP assumptions', async () => {
    for (const root of ['query', 'mutation']) {
        const point = { method: 'POST', orig: 'item', graphql: { doc: root + ' { item }' } };
        const ctx = { apimodel: { main: { kit: { entity: { item: { name: 'item', op: { load: { name: 'load', points: [point] } } } } } } }, def: { [root]: { item: { args: [{ name: 'input', reqd: true, type: 'Input' }] } }, types: { Input: { kind: 'INPUT_OBJECT', fields: { count: { type: 'Int' } } } } } };
        await (0, contract_1.contractTransform)(ctx);
        const facts = JSON.parse(point.contract.json);
        strict_1.default.equal(facts.protocol, 'graphql');
        strict_1.default.equal(facts.field.args[0].type, 'Input');
        strict_1.default.equal(facts.types.Input.fields.count.type, 'Int');
    }
});
(0, node_test_1.test)('recursive resolved schemas retain local references without changing shared nodes', () => {
    const schema = { type: 'object', properties: {} };
    schema.properties.child = schema;
    const source = { 'a/b~c': schema, second: schema };
    const facts = JSON.parse((0, contract_1.contractJSON)(source));
    strict_1.default.deepEqual(facts['a/b~c'].properties.child, { $ref: '#/a~1b~0c' });
    strict_1.default.deepEqual(facts.second.properties.child, { $ref: '#/second' });
    strict_1.default.equal(schema.properties.child, schema);
});
(0, node_test_1.test)('large GraphQL output catalogues do not multiply per-operation contract size', () => {
    const types = {
        Input: { kind: 'INPUT_OBJECT', fields: { nested: { type: 'Input' }, value: { type: 'Choice' } } },
        Choice: { kind: 'ENUM', values: ['A', 'B'] },
    };
    for (let i = 0; i < 2000; i++)
        types['Output' + i] = { kind: 'OBJECT', fields: { related: { type: 'Output' + ((i + 1) % 2000) } } };
    const selected = (0, contract_1.graphqlInputTypes)({ args: [{ type: 'Input' }] }, types);
    strict_1.default.deepEqual(Object.keys(selected).sort(), ['Choice', 'Input']);
    strict_1.default.equal(selected.Input.fields.nested.type, 'Input');
    strict_1.default.ok((0, contract_1.contractJSON)(selected).length < 300);
});
//# sourceMappingURL=contract.test.js.map