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
// A schema is a record's property, read by every operation, unless its row
// puts it at `body`: a JSON request body, sent from one field.
const RECORD_OPS = [['load', 'GET'], ['list', 'GET'], ['create', 'POST'], ['update', 'PUT']];
const BODY_OPS = [['create', 'POST'], ['update', 'PUT']];
(0, node_test_1.describe)('field-nullable', () => {
    (0, node_test_1.test)('has cases', () => strict_1.default.ok(rows.length > 0));
    for (const [name, source, expected, field, at] of rows) {
        const key = field || 'value';
        const body = 'body' === at;
        for (const [op, method] of body ? BODY_OPS : RECORD_OPS) {
            (0, node_test_1.test)(name + ': ' + op, async () => {
                const property = JSON.parse(source);
                const point = { o: '/things', m: method, k: 'json' };
                let schema = property;
                if (body) {
                    point.t = { req: '`reqdata.' + key + '`' };
                }
                else {
                    property.key$ = key;
                    const record = { type: 'object', required: [key], properties: {
                            [key]: property, label: { type: 'string' },
                        } };
                    schema = 'list' === op ? { type: 'array', items: record } : record;
                }
                const content = { content: { 'application/json': { schema } } };
                const opdef = ['create', 'update'].includes(op) ?
                    { requestBody: content } : { responses: { 200: content } };
                const entity = { name: 'thing', fields: {}, op: { [op]: { name: op, points: [point] } } };
                const def = { paths: { '/things': { [method.toLowerCase()]: opdef } } };
                // A body is listed beside the response it is read with, which numbers it.
                const facts = () => JSON.stringify({ ...property, index$: undefined });
                const before = facts();
                await (0, field_1.fieldTransform)({ apimodel: { main: { kit: { entity: { thing: entity } } } }, def });
                strict_1.default.deepEqual(entity.fields[key].t, JSON.parse(expected));
                strict_1.default.equal(entity.fields[key].r, !body);
                strict_1.default.equal(facts(), before);
            });
        }
    }
});
//# sourceMappingURL=field-nullable.test.js.map