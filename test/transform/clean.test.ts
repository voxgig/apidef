/* Copyright (c) 2024-2025 Voxgig Ltd, MIT License */


import { test, describe } from 'node:test'
import assert from 'node:assert'



import {
  cleanTransform
} from '../../dist/transform/clean'


describe('transform-clean', () => {

  test('basic', async () => {
    assert.ok(cleanTransform)

    let c: any = { apimodel: { a: { x: 1 }, b$: { x: 2 }, c: {}, d: [] } }
    let r: any = await cleanTransform(c)
    assert.deepStrictEqual(r.ok, true)
    assert.deepStrictEqual(c.apimodel, { a: { x: 1 } })
  })


})

