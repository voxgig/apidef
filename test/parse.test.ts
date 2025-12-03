/* Copyright (c) 2024-2025 Voxgig Ltd, MIT License */


import { test, describe } from 'node:test'
import { expect } from '@hapi/code'



import {
  parse,
} from '../dist/parse'


describe('parse', () => {

  test('happy', async () => {
    expect(parse).exist()

    await expect(parse('not-a-kind', '')).reject(/unknown/)
    await expect(parse('OpenAPI', 'bad')).reject(/JSON/)
    await expect(parse('OpenAPI', undefined)).reject(/JSON/)
    await expect(parse('OpenAPI', '{}')).reject(/Unsupported/)

    const p0 = await parse(
      'OpenAPI', '{"openapi":"3.0.0", "info": {"title": "T0","version": "1.0.0"},"paths":{}}')
    expect(p0).equal({
      openapi: '3.0.0',
      info: { title: 'T0', version: '1.0.0' },
      paths: {},
      components: {}
    })

    const p1 = await parse('OpenAPI', `
openapi: 3.0.0
info:
  title: T1
  version: 1.0.0
paths: {}
`)

    expect(p1).equal({
      openapi: '3.0.0',
      info: { title: 'T1', version: '1.0.0' },
      paths: {},
      components: {}
    })

  })



})

