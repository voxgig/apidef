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
  test('preserves empty entity field maps', async () => {
    const ctx: any = {
      apimodel: { main: { kit: { entity: {
        empty: { name: 'empty', fields: {}, other: {} },
        populated: { name: 'populated', fields: { id: { n: 'id', h: 'Id' } } },
      } } } },
    }
    await cleanTransform(ctx)
    assert.deepStrictEqual(ctx.apimodel.main.kit.entity, {
      empty: { name: 'empty', fields: {} },
      populated: { name: 'populated', fields: { id: { n: 'id', h: 'Id' } } },
    })
  })
})
