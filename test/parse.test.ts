/* Copyright (c) 2024-2025 Voxgig Ltd, MIT License */


import { test, describe } from 'node:test'
import assert from 'node:assert'



import {
  parse,
} from '../dist/parse'


describe('parse', () => {

  test('happy', async () => {
    const pm0 = { file: 'f0' }

    assert.ok(parse)

    await assert.rejects(parse('not-a-kind', '', pm0), /unknown/)
    await assert.rejects(parse('OpenAPI', 'bad', pm0), /JSON/)
    await assert.rejects(parse('OpenAPI', undefined, pm0), /string/)
    await assert.rejects(parse('OpenAPI', '{}', pm0), /Unsupported/)
    await assert.rejects(parse('OpenAPI', '', pm0), /empty/)

    await assert.rejects(parse('OpenAPI', `openapi: 3.0.0
a::1`, pm0), /syntax/)

    const p0 = await parse(
      'OpenAPI',
      '{"openapi":"3.0.0", "info": {"title": "T0","version": "1.0.0"},"paths":{}}',
      pm0)
    assert.deepStrictEqual(p0, {
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

    assert.deepStrictEqual(p1, {
      openapi: '3.0.0',
      info: { title: 'T1', version: '1.0.0' },
      paths: {},
      components: {}
    })

  })


  test('validateSource', async () => {
    const pm0 = { file: 'f0' }

    // Empty string should be rejected
    await assert.rejects(parse('OpenAPI', '', pm0), /source is empty/)

    // Only whitespace should be rejected
    await assert.rejects(parse('OpenAPI', '   \n\t  \n  ', pm0), /source is empty/)

    // Only YAML comments should be rejected
    await assert.rejects(parse('OpenAPI', '# Just a comment', pm0), /source is empty/)

    // Comments and whitespace should be rejected
    await assert.rejects(parse('OpenAPI', `
# Comment 1
  # Comment 2
    # Comment 3
`, pm0), /source is empty/)

    // Mix of comments and whitespace should be rejected
    await assert.rejects(parse('OpenAPI', `

# Header comment

  # Another comment

`, pm0), /source is empty/)
  })


})

