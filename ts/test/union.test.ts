/* Copyright (c) 2024-2026 Richard Rodger, MIT License */

// An UNTAGGED union — oneOf/anyOf, two or more real branches, no
// `discriminator` — cannot be resolved to a variant by any generator: nothing
// in the schema says which branch a given value is. The field can only be
// modelled as an open type, and the point of detecting it is to let the
// generated documentation SAY why the type is open.
//
// The live case is the Typebot Builder spec, whose `groups` field is an array
// whose item schema carries 18 untagged unions, the widest 19 branches, 12
// levels down — which is why the scan has to recurse rather than look at the
// field's own schema.

import { describe, test } from 'node:test'
import { equal, deepEqual } from 'node:assert'

// Built module, matching the other suites: the compiled test runs from
// dist-test/, where a ../src path does not resolve.
import {
  untaggedUnionBranches,
  scanUntaggedUnion,
} from '../dist/utility'


describe('untagged-union', () => {

  describe('untaggedUnionBranches', () => {

    test('counts real branches of oneOf and anyOf', () => {
      equal(untaggedUnionBranches({ oneOf: [{ type: 'string' }, { type: 'number' }] }), 2)
      equal(untaggedUnionBranches(
        { anyOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }] }), 3)
    })


    test('a discriminated union is resolvable, so not counted', () => {
      // The discriminator names the property that decides the branch, which
      // is precisely what an untagged union lacks.
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
      // The shape of the Typebot `groups` field: an array whose items carry
      // the union.
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
      // These specs reference themselves freely; an unguarded walk would spin.
      const node: any = { type: 'object', properties: {} }
      node.properties.self = node
      node.properties.choice = { oneOf: [{ type: 'string' }, { type: 'number' }] }
      const found = scanUntaggedUnion(node)
      equal(found?.count, 1)
      equal(found?.branches, 2)
    })

  })

})
