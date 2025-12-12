/* Copyright (c) 2024-2025 Voxgig Ltd, MIT License */


import { test, describe } from 'node:test'
import { expect } from '@hapi/code'



import {
  cleanTransform
} from '../../dist/transform/clean'


describe('transform-clean', () => {

  test('basic', async () => {
    expect(cleanTransform).exist()

    let c, r
    c = { apimodel: { a: { x: 1 }, b$: { x: 2 }, c: {}, d: [] } }
    r = await cleanTransform(c)
    expect(r.ok).equal(true)
    expect(c.apimodel).equal({ a: { x: 1 } })
  })


})

