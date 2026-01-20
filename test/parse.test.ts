/* Copyright (c) 2024-2025 Voxgig Ltd, MIT License */


import { test, describe } from 'node:test'
import { expect } from '@hapi/code'



import {
  parse,
} from '../dist/parse'


describe('parse', () => {

  test('happy', async () => {
    const pm0 = { file: 'f0' }

    expect(parse).exist()

    await expect(parse('not-a-kind', '', pm0)).reject(/unknown/)
    await expect(parse('OpenAPI', 'bad', pm0)).reject(/JSON/)
    await expect(parse('OpenAPI', undefined, pm0)).reject(/string/)
    await expect(parse('OpenAPI', '{}', pm0)).reject(/Unsupported/)
    await expect(parse('OpenAPI', '', pm0)).reject(/empty/)

    await expect(parse('OpenAPI', `openapi: 3.0.0
a::1`, pm0)).reject(/syntax/)

    const p0 = await parse(
      'OpenAPI',
      '{"openapi":"3.0.0", "info": {"title": "T0","version": "1.0.0"},"paths":{}}',
      pm0)
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
`, pm0)

    expect(p1).equal({
      openapi: '3.0.0',
      info: { title: 'T1', version: '1.0.0' },
      paths: {},
      components: {}
    })

  })


  test('validateSource', async () => {
    const pm0 = { file: 'f0' }

    // Empty string should be rejected
    await expect(parse('OpenAPI', '', pm0)).reject(/source is empty/)

    // Only whitespace should be rejected
    await expect(parse('OpenAPI', '   \n\t  \n  ', pm0)).reject(/source is empty/)

    // Only YAML comments should be rejected
    await expect(parse('OpenAPI', '# Just a comment', pm0)).reject(/source is empty/)

    // Comments and whitespace should be rejected
    await expect(parse('OpenAPI', `
# Comment 1
  # Comment 2
    # Comment 3
`, pm0)).reject(/source is empty/)

    // Mix of comments and whitespace should be rejected
    await expect(parse('OpenAPI', `

# Header comment

  # Another comment

`, pm0)).reject(/source is empty/)
  })


})

