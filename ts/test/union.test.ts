/* Copyright (c) 2024-2026 Richard Rodger, MIT License */


import { describe, test } from 'node:test'
import { equal, deepEqual, strictEqual } from 'node:assert'

// Built module, matching the other suites: the compiled test runs from
// dist-test/, where a ../src path does not resolve.
import {
  untaggedUnionBranches,
  scanUntaggedUnion,
} from '../dist/utility'

import { parse } from '../dist/parse'
import { heuristic01 } from '../dist/guide/heuristic01'


describe('untagged-union', () => {

  describe('untaggedUnionBranches', () => {

    test('counts real branches of oneOf and anyOf', () => {
      equal(untaggedUnionBranches({ oneOf: [{ type: 'string' }, { type: 'number' }] }), 2)
      equal(untaggedUnionBranches(
        { anyOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }] }), 3)
    })


    test('a discriminated union is resolvable, so not counted', () => {
      equal(untaggedUnionBranches({
        oneOf: [{ type: 'object' }, { type: 'object' }],
        discriminator: { propertyName: 'kind' },
      }), 0)
    })


    test('the nullable idiom is one type, not a choice', () => {
      // anyOf: [X, null] means "X, possibly absent" — there is no variant to
      // pick, so flagging it would bury the real unions in noise.
      equal(untaggedUnionBranches({ anyOf: [{ type: 'string' }, { type: 'null' }] }), 0)
      equal(untaggedUnionBranches({ oneOf: [{ type: 'object' }, { type: 'null' }] }), 0)
    })


    test('ignores non-unions', () => {
      equal(untaggedUnionBranches({ type: 'string' }), 0)
      equal(untaggedUnionBranches({ allOf: [{ type: 'object' }, { type: 'object' }] }), 0)
      equal(untaggedUnionBranches({ oneOf: [{ type: 'string' }] }), 0)
      equal(untaggedUnionBranches({ oneOf: [] }), 0)
      equal(untaggedUnionBranches(null), 0)
      equal(untaggedUnionBranches('nope'), 0)
    })

  })


  describe('scanUntaggedUnion', () => {

    test('null when nothing beneath the field is a union', () => {
      equal(scanUntaggedUnion({ type: 'object', properties: { a: { type: 'string' } } }), null)
      equal(scanUntaggedUnion(null), null)
    })


    test('finds a union at the field itself', () => {
      deepEqual(
        scanUntaggedUnion({ oneOf: [{ type: 'string' }, { type: 'number' }] }),
        { count: 1, branches: 2, depth: 0 })
    })


    test('finds a union nested below the field, reporting its depth', () => {
      const schema = {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            blocks: {
              type: 'array',
              items: { anyOf: [{ type: 'object' }, { type: 'object' }, { type: 'object' }] },
            },
          },
        },
      }
      const found = scanUntaggedUnion(schema)
      equal(found?.count, 1)
      equal(found?.branches, 3)
      // The walk is generic over object values, so the `properties` container
      // counts as a level of its own: schema -> items -> properties -> blocks
      // -> items. Depth is a relative "how far down", not a JSON-Pointer hop
      // count, and is only ever compared against other depths.
      equal(found?.depth, 4)
    })


    test('reports the WIDEST union and the total count', () => {
      const schema = {
        a: { oneOf: [{ type: 'string' }, { type: 'number' }] },
        b: { anyOf: [{ type: 'a' }, { type: 'b' }, { type: 'c' }, { type: 'd' }] },
      }
      const found = scanUntaggedUnion(schema)
      equal(found?.count, 2)
      equal(found?.branches, 4)
    })


    test('survives a self-referential schema', () => {
      const node: any = { type: 'object', properties: {} }
      node.properties.self = node
      node.properties.choice = { oneOf: [{ type: 'string' }, { type: 'number' }] }
      const found = scanUntaggedUnion(node)
      equal(found?.count, 1)
      equal(found?.branches, 2)
    })

  })

})


const SHARED_UNION_SPEC = `
openapi: 3.0.0
info: { title: Shared, version: '1' }
paths:
  /thing:
    get:
      responses:
        '200':
          description: The thing.
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Thing' }
components:
  schemas:
    App:
      type: object
      properties:
        owner: { oneOf: [{ type: string }, { type: integer }] }
    Thing:
      type: object
      properties:
        id: { type: string }
        a: { type: object, properties: { apps: { type: array, items: { $ref: '#/components/schemas/App' } } } }
        b: { type: object, properties: { apps: { type: array, items: { $ref: '#/components/schemas/App' } } } }
`


describe('a union the definition shares', () => {

  // The guide reads a response's properties through struct's merge, which
  // rewrites each list element it walks, so it once gave every reference to
  // a schema a copy of its own and the union was counted once per copy.
  test('stays one object, counted once, after the guide has run', async () => {
    const def = await parse('OpenAPI', SHARED_UNION_SPEC, { file: 'shared-union.yaml' })
    const thing = def.paths['/thing'].get.responses['200'].content['application/json'].schema
    const app = (side: string) => thing.properties[side].properties.apps.items
    strictEqual(app('a').properties, app('b').properties)

    const quiet = () => undefined
    await heuristic01({
      def,
      log: { info: quiet, debug: quiet, warn: quiet, error: quiet },
      warn: quiet,
    } as any)

    strictEqual(app('a').properties, app('b').properties)
    deepEqual(scanUntaggedUnion(thing), { count: 1, branches: 2, depth: 7 })
  })

})
