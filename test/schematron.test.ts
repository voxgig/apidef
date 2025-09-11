// converter.test.js
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

// Adjust this path to your built JS module that exports convertToVoxgigStruct
import { convert } from '../dist/schematron.js';


describe('schematron', () => {

  test('top-level primitive (string)', () => {
    const out = convert({ type: 'string' });
    assert.equal(out, '$STRING');
  });

  test('top-level primitive (nullable via OpenAPI nullable:true)', () => {
    const out = convert({ type: 'string', nullable: true });
    assert.deepEqual(out, ['$ONE', '$STRING', '$NULL']);
  });

  test('top-level union of primitives (type array)', () => {
    const out = convert({ type: ['string', 'integer'] });
    assert.deepEqual(out, ['$ONE', '$STRING', '$INTEGER']);
  });

  test('nullable via type includes "null"', () => {
    const out = convert({ type: ['string', 'null'] });
    assert.deepEqual(out, ['$ONE', '$STRING', '$NULL']);
  });

  test('empty schema -> $ANY', () => {
    const out = convert({});
    assert.equal(out, '$ANY');
  });

  test('enum -> $EXACT', () => {
    const out = convert({ type: 'string', enum: ['red', 'green'] });
    assert.deepEqual(out, ['$EXACT', 'red', 'green']);
  });

  test('const -> $EXACT single', () => {
    const out = convert({ const: 42 });
    assert.deepEqual(out, ['$EXACT', 42]);
  });

  test('object with properties (no additionalProperties)', () => {
    const out = convert({
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'integer' }
      }
    });
    assert.deepEqual(out, {
      name: '$STRING',
      age: '$INTEGER'
    });
  });

  test('object property nullable (subschema nullable:true)', () => {
    const out = convert({
      type: 'object',
      properties: {
        nickname: { type: 'string', nullable: true }
      }
    });
    assert.deepEqual(out, {
      nickname: ['$ONE', '$STRING', '$NULL']
    });
  });

  test('object property nullable via oneOf including null', () => {
    const out = convert({
      type: 'object',
      properties: {
        val: { oneOf: [{ type: 'integer' }, { type: 'null' }] }
      }
    });
    // oneOf at property level should become ["$ONE", "$INTEGER", "$NULL"]
    assert.deepEqual(out, { val: ['$ONE', '$INTEGER', '$NULL'] });
  });

  test('additionalProperties: true -> $OPEN', () => {
    const out = convert({
      type: 'object',
      additionalProperties: true,
      properties: { a: { type: 'string' } }
    });
    assert.deepEqual(out, {
      $OPEN: true,
      a: '$STRING'
    });
  });

  test('additionalProperties: {type:"string"} -> $OPEN (untyped extras per rule 6)', () => {
    const out = convert({
      type: 'object',
      additionalProperties: { type: 'string' },
      properties: { known: { type: 'integer' } }
    });
    assert.deepEqual(out, {
      $OPEN: true,
      known: '$INTEGER'
    });
  });

  test('OpenAPI annotations -> $NOTE', () => {
    const out = convert({
      type: 'object',
      readOnly: true,
      writeOnly: true,
      deprecated: true,
      properties: { f: { type: 'string' } }
    });
    assert.deepEqual(out, {
      $NOTE: { readOnly: true, writeOnly: true, deprecated: true },
      f: '$STRING'
    });
  });

  test('array: homogeneous items -> ["$CHILD", sub]', () => {
    const out = convert({
      type: 'array',
      items: { type: 'string' }
    });
    assert.deepEqual(out, ['$CHILD', '$STRING']);
  });

  test('array: tuples -> positional array', () => {
    const out = convert({
      type: 'array',
      items: [{ type: 'string' }, { type: 'integer' }]
    });
    assert.deepEqual(out, ['$STRING', '$INTEGER']);
  });

  test('array: no items -> [] (any children)', () => {
    const out = convert({ type: 'array' });
    assert.deepEqual(out, []);
  });

  test('oneOf -> ["$ONE", ...]', () => {
    const out = convert({
      oneOf: [{ type: 'string' }, { type: 'integer' }]
    });
    assert.deepEqual(out, ['$ONE', '$STRING', '$INTEGER']);
  });

  test('anyOf -> ["$ANY", ...]', () => {
    const out = convert({
      anyOf: [{ type: 'string' }, { type: 'integer' }]
    });
    assert.deepEqual(out, ['$ANY', '$STRING', '$INTEGER']);
  });

  test('allOf merges object properties and openness', () => {
    const out = convert({
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
    assert.deepEqual(out, {
      $OPEN: true,
      a: '$STRING',
      b: '$INTEGER'
    });
  });

  test('$ref expansion via rootDoc (#/components/schemas/Refd)', () => {
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
    const out = convert(
      { $ref: '#/components/schemas/Refd' },
      { rootDoc }
    );
    assert.deepEqual(out, { x: '$NUMBER' });
  });

  test('$ref expansion with local decorations merged over target', () => {
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
    const out = convert(
      {
        $ref: '#/components/schemas/Pet',
        properties: { age: { type: 'integer' } } // local decoration
      },
      { rootDoc }
    );
    assert.deepEqual(out, { name: '$STRING', age: '$INTEGER' });
  });

  test('unresolvable $ref -> falls back to $ANY', () => {
    const out = convert({ $ref: '#/no/such/path' }, { rootDoc: {} });
    assert.equal(out, '$ANY');
  });

  test('nullable wrapper does not duplicate $NULL for existing $ONE with $NULL', () => {
    const out = convert({
      type: 'object',
      properties: {
        v: { oneOf: [{ type: 'string' }, { type: 'null' }], nullable: true }
      }
    });
    // still exactly one $NULL
    assert.deepEqual(out, { v: ['$ONE', '$STRING', '$NULL'] });
  });

  test('EXACT mixed-type enum (strings/numbers)', () => {
    const out = convert({ enum: ['A', 1, 2] });
    assert.deepEqual(out, ['$EXACT', 'A', 1, 2]);
  });

  test('object detection without explicit type (properties only)', () => {
    const out = convert({
      properties: { p: { type: 'boolean' } }
    });
    assert.deepEqual(out, { p: '$BOOLEAN' });
  });

  test('array detection without explicit type (items only)', () => {
    const out = convert({
      items: { type: 'integer' }
    });
    assert.deepEqual(out, ['$CHILD', '$INTEGER']);
  });

  test('unsupported facets (patternProperties) are ignored; known props still convert', () => {
    const out = convert({
      type: 'object',
      patternProperties: { '^x-': { type: 'string' } },
      properties: { ok: { type: 'string' } }
    });
    assert.deepEqual(out, { ok: '$STRING' });
  });

  test('self-referential $ref guarded by cycle protection -> $ANY', () => {
    const rootDoc = {
      components: {
        schemas: {
          Node: {
            $ref: '#/components/schemas/Node'
          }
        }
      }
    };
    const out = convert(
      { $ref: '#/components/schemas/Node' },
      { rootDoc }
    );
    assert.equal(out, '$ANY');
  });

  test('anyOf with nested objects becomes ["$ANY", ...converted objs]', () => {
    const out = convert({
      anyOf: [
        { type: 'object', properties: { a: { type: 'string' } } },
        { type: 'object', properties: { b: { type: 'integer' } } }
      ]
    });
    assert.deepEqual(out, [
      '$ANY',
      { a: '$STRING' },
      { b: '$INTEGER' }
    ]);
  });

  test('homogeneous array of nullable strings', () => {
    const out = convert({
      type: 'array',
      items: { type: 'string', nullable: true }
    });
    assert.deepEqual(out, ['$CHILD', ['$ONE', '$STRING', '$NULL']]);
  });

  test('tuple array with inner enums and consts', () => {
    const out = convert({
      type: 'array',
      items: [
        { enum: ['a', 'b'] },
        { const: 0 },
        { type: 'boolean' }
      ]
    });
    assert.deepEqual(out, [
      ['$EXACT', 'a', 'b'],
      ['$EXACT', 0],
      '$BOOLEAN'
    ]);
  });

  test('allOf merging carries top-level decorations like nullable on props', () => {
    const out = convert({
      allOf: [
        { type: 'object', properties: { n: { type: 'number' } } },
        { type: 'object', properties: { n: { nullable: true } } }
      ]
    });
    assert.deepEqual(out, { n: ['$ONE', '$NUMBER', '$NULL'] });
  });

  test('root ANY when schema has unknown/unsupported keywords only', () => {
    const out = convert({ not: { type: 'string' } });
    // "not" unsupported -> fallback $ANY
    assert.equal(out, '$ANY');
  });


})
