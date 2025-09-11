"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// converter.test.js
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
// Adjust this path to your built JS module that exports convertToVoxgigStruct
const schematron_js_1 = require("../dist/schematron.js");
(0, node_test_1.describe)('schematron', () => {
    (0, node_test_1.test)('top-level primitive (string)', () => {
        const out = (0, schematron_js_1.convert)({ type: 'string' });
        strict_1.default.equal(out, '$STRING');
    });
    (0, node_test_1.test)('top-level primitive (nullable via OpenAPI nullable:true)', () => {
        const out = (0, schematron_js_1.convert)({ type: 'string', nullable: true });
        strict_1.default.deepEqual(out, ['$ONE', '$STRING', '$NULL']);
    });
    (0, node_test_1.test)('top-level union of primitives (type array)', () => {
        const out = (0, schematron_js_1.convert)({ type: ['string', 'integer'] });
        strict_1.default.deepEqual(out, ['$ONE', '$STRING', '$INTEGER']);
    });
    (0, node_test_1.test)('nullable via type includes "null"', () => {
        const out = (0, schematron_js_1.convert)({ type: ['string', 'null'] });
        strict_1.default.deepEqual(out, ['$ONE', '$STRING', '$NULL']);
    });
    (0, node_test_1.test)('empty schema -> $ANY', () => {
        const out = (0, schematron_js_1.convert)({});
        strict_1.default.equal(out, '$ANY');
    });
    (0, node_test_1.test)('enum -> $EXACT', () => {
        const out = (0, schematron_js_1.convert)({ type: 'string', enum: ['red', 'green'] });
        strict_1.default.deepEqual(out, ['$EXACT', 'red', 'green']);
    });
    (0, node_test_1.test)('const -> $EXACT single', () => {
        const out = (0, schematron_js_1.convert)({ const: 42 });
        strict_1.default.deepEqual(out, ['$EXACT', 42]);
    });
    (0, node_test_1.test)('object with properties (no additionalProperties)', () => {
        const out = (0, schematron_js_1.convert)({
            type: 'object',
            properties: {
                name: { type: 'string' },
                age: { type: 'integer' }
            }
        });
        strict_1.default.deepEqual(out, {
            name: '$STRING',
            age: '$INTEGER'
        });
    });
    (0, node_test_1.test)('object property nullable (subschema nullable:true)', () => {
        const out = (0, schematron_js_1.convert)({
            type: 'object',
            properties: {
                nickname: { type: 'string', nullable: true }
            }
        });
        strict_1.default.deepEqual(out, {
            nickname: ['$ONE', '$STRING', '$NULL']
        });
    });
    (0, node_test_1.test)('object property nullable via oneOf including null', () => {
        const out = (0, schematron_js_1.convert)({
            type: 'object',
            properties: {
                val: { oneOf: [{ type: 'integer' }, { type: 'null' }] }
            }
        });
        // oneOf at property level should become ["$ONE", "$INTEGER", "$NULL"]
        strict_1.default.deepEqual(out, { val: ['$ONE', '$INTEGER', '$NULL'] });
    });
    (0, node_test_1.test)('additionalProperties: true -> $OPEN', () => {
        const out = (0, schematron_js_1.convert)({
            type: 'object',
            additionalProperties: true,
            properties: { a: { type: 'string' } }
        });
        strict_1.default.deepEqual(out, {
            $OPEN: true,
            a: '$STRING'
        });
    });
    (0, node_test_1.test)('additionalProperties: {type:"string"} -> $OPEN (untyped extras per rule 6)', () => {
        const out = (0, schematron_js_1.convert)({
            type: 'object',
            additionalProperties: { type: 'string' },
            properties: { known: { type: 'integer' } }
        });
        strict_1.default.deepEqual(out, {
            $OPEN: true,
            known: '$INTEGER'
        });
    });
    (0, node_test_1.test)('OpenAPI annotations -> $NOTE', () => {
        const out = (0, schematron_js_1.convert)({
            type: 'object',
            readOnly: true,
            writeOnly: true,
            deprecated: true,
            properties: { f: { type: 'string' } }
        });
        strict_1.default.deepEqual(out, {
            $NOTE: { readOnly: true, writeOnly: true, deprecated: true },
            f: '$STRING'
        });
    });
    (0, node_test_1.test)('array: homogeneous items -> ["$CHILD", sub]', () => {
        const out = (0, schematron_js_1.convert)({
            type: 'array',
            items: { type: 'string' }
        });
        strict_1.default.deepEqual(out, ['$CHILD', '$STRING']);
    });
    (0, node_test_1.test)('array: tuples -> positional array', () => {
        const out = (0, schematron_js_1.convert)({
            type: 'array',
            items: [{ type: 'string' }, { type: 'integer' }]
        });
        strict_1.default.deepEqual(out, ['$STRING', '$INTEGER']);
    });
    (0, node_test_1.test)('array: no items -> [] (any children)', () => {
        const out = (0, schematron_js_1.convert)({ type: 'array' });
        strict_1.default.deepEqual(out, []);
    });
    (0, node_test_1.test)('oneOf -> ["$ONE", ...]', () => {
        const out = (0, schematron_js_1.convert)({
            oneOf: [{ type: 'string' }, { type: 'integer' }]
        });
        strict_1.default.deepEqual(out, ['$ONE', '$STRING', '$INTEGER']);
    });
    (0, node_test_1.test)('anyOf -> ["$ANY", ...]', () => {
        const out = (0, schematron_js_1.convert)({
            anyOf: [{ type: 'string' }, { type: 'integer' }]
        });
        strict_1.default.deepEqual(out, ['$ANY', '$STRING', '$INTEGER']);
    });
    (0, node_test_1.test)('allOf merges object properties and openness', () => {
        const out = (0, schematron_js_1.convert)({
            allOf: [
                {
                    type: 'object',
                    properties: { a: { type: 'string' } },
                    additionalProperties: false
                },
                {
                    type: 'object',
                    properties: { b: { type: 'integer' } },
                    additionalProperties: true
                }
            ]
        });
        // second schema's openness should propagate -> $OPEN: true
        strict_1.default.deepEqual(out, {
            $OPEN: true,
            a: '$STRING',
            b: '$INTEGER'
        });
    });
    (0, node_test_1.test)('$ref expansion via rootDoc (#/components/schemas/Refd)', () => {
        const rootDoc = {
            components: {
                schemas: {
                    Refd: {
                        type: 'object',
                        properties: { x: { type: 'number' } }
                    }
                }
            }
        };
        const out = (0, schematron_js_1.convert)({ $ref: '#/components/schemas/Refd' }, { rootDoc });
        strict_1.default.deepEqual(out, { x: '$NUMBER' });
    });
    (0, node_test_1.test)('$ref expansion with local decorations merged over target', () => {
        const rootDoc = {
            components: {
                schemas: {
                    Pet: {
                        type: 'object',
                        properties: { name: { type: 'string' } }
                    }
                }
            }
        };
        const out = (0, schematron_js_1.convert)({
            $ref: '#/components/schemas/Pet',
            properties: { age: { type: 'integer' } } // local decoration
        }, { rootDoc });
        strict_1.default.deepEqual(out, { name: '$STRING', age: '$INTEGER' });
    });
    (0, node_test_1.test)('unresolvable $ref -> falls back to $ANY', () => {
        const out = (0, schematron_js_1.convert)({ $ref: '#/no/such/path' }, { rootDoc: {} });
        strict_1.default.equal(out, '$ANY');
    });
    (0, node_test_1.test)('nullable wrapper does not duplicate $NULL for existing $ONE with $NULL', () => {
        const out = (0, schematron_js_1.convert)({
            type: 'object',
            properties: {
                v: { oneOf: [{ type: 'string' }, { type: 'null' }], nullable: true }
            }
        });
        // still exactly one $NULL
        strict_1.default.deepEqual(out, { v: ['$ONE', '$STRING', '$NULL'] });
    });
    (0, node_test_1.test)('EXACT mixed-type enum (strings/numbers)', () => {
        const out = (0, schematron_js_1.convert)({ enum: ['A', 1, 2] });
        strict_1.default.deepEqual(out, ['$EXACT', 'A', 1, 2]);
    });
    (0, node_test_1.test)('object detection without explicit type (properties only)', () => {
        const out = (0, schematron_js_1.convert)({
            properties: { p: { type: 'boolean' } }
        });
        strict_1.default.deepEqual(out, { p: '$BOOLEAN' });
    });
    (0, node_test_1.test)('array detection without explicit type (items only)', () => {
        const out = (0, schematron_js_1.convert)({
            items: { type: 'integer' }
        });
        strict_1.default.deepEqual(out, ['$CHILD', '$INTEGER']);
    });
    (0, node_test_1.test)('unsupported facets (patternProperties) are ignored; known props still convert', () => {
        const out = (0, schematron_js_1.convert)({
            type: 'object',
            patternProperties: { '^x-': { type: 'string' } },
            properties: { ok: { type: 'string' } }
        });
        strict_1.default.deepEqual(out, { ok: '$STRING' });
    });
    (0, node_test_1.test)('self-referential $ref guarded by cycle protection -> $ANY', () => {
        const rootDoc = {
            components: {
                schemas: {
                    Node: {
                        $ref: '#/components/schemas/Node'
                    }
                }
            }
        };
        const out = (0, schematron_js_1.convert)({ $ref: '#/components/schemas/Node' }, { rootDoc });
        strict_1.default.equal(out, '$ANY');
    });
    (0, node_test_1.test)('anyOf with nested objects becomes ["$ANY", ...converted objs]', () => {
        const out = (0, schematron_js_1.convert)({
            anyOf: [
                { type: 'object', properties: { a: { type: 'string' } } },
                { type: 'object', properties: { b: { type: 'integer' } } }
            ]
        });
        strict_1.default.deepEqual(out, [
            '$ANY',
            { a: '$STRING' },
            { b: '$INTEGER' }
        ]);
    });
    (0, node_test_1.test)('homogeneous array of nullable strings', () => {
        const out = (0, schematron_js_1.convert)({
            type: 'array',
            items: { type: 'string', nullable: true }
        });
        strict_1.default.deepEqual(out, ['$CHILD', ['$ONE', '$STRING', '$NULL']]);
    });
    (0, node_test_1.test)('tuple array with inner enums and consts', () => {
        const out = (0, schematron_js_1.convert)({
            type: 'array',
            items: [
                { enum: ['a', 'b'] },
                { const: 0 },
                { type: 'boolean' }
            ]
        });
        strict_1.default.deepEqual(out, [
            ['$EXACT', 'a', 'b'],
            ['$EXACT', 0],
            '$BOOLEAN'
        ]);
    });
    (0, node_test_1.test)('allOf merging carries top-level decorations like nullable on props', () => {
        const out = (0, schematron_js_1.convert)({
            allOf: [
                { type: 'object', properties: { n: { type: 'number' } } },
                { type: 'object', properties: { n: { nullable: true } } }
            ]
        });
        strict_1.default.deepEqual(out, { n: ['$ONE', '$NUMBER', '$NULL'] });
    });
    (0, node_test_1.test)('root ANY when schema has unknown/unsupported keywords only', () => {
        const out = (0, schematron_js_1.convert)({ not: { type: 'string' } });
        // "not" unsupported -> fallback $ANY
        strict_1.default.equal(out, '$ANY');
    });
});
//# sourceMappingURL=schematron.test.js.map