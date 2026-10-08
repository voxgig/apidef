"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const field_1 = require("../dist/transform/field");
const lines = (0, node_fs_1.readFileSync)((0, node_path_1.join)(__dirname, '../test/field-nullable.tsv'), 'utf8').trim().split(/\r?\n/);
const rows = lines.slice(1).map(line => line.split('\t'));
(0, node_test_1.describe)('field-nullable', () => {
    (0, node_test_1.test)('has cases', () => strict_1.default.ok(rows.length > 0));
    for (const [name, source, expected] of rows) {
        for (const [op, method] of [['load', 'GET'], ['list', 'GET'], ['create', 'POST'], ['update', 'PUT']]) {
            (0, node_test_1.test)(name + ': ' + op, async () => {
                const property = JSON.parse(source);
                property.key$ = 'value';
                const record = { type: 'object', required: ['value'], properties: {
                        value: property, label: { type: 'string' },
                    } };
                const schema = 'list' === op ? { type: 'array', items: record } : record;
                const body = { content: { 'application/json': { schema } } };
                const opdef = ['create', 'update'].includes(op) ?
                    { requestBody: body } : { responses: { 200: body } };
                const entity = { name: 'thing', fields: {},
                    op: { [op]: { name: op, points: [{ o: '/things', m: method, k: 'json' }] } },
                };
                const def = { paths: { '/things': { [method.toLowerCase()]: opdef } } };
                const before = JSON.stringify(property);
                await (0, field_1.fieldTransform)({ apimodel: { main: { kit: { entity: { thing: entity } } } }, def });
                strict_1.default.deepEqual(entity.fields.value.t, JSON.parse(expected));
                strict_1.default.equal(entity.fields.value.r, true);
                strict_1.default.equal(JSON.stringify(property), before);
            });
        }
    }
});
//# sourceMappingURL=field-nullable.test.js.map