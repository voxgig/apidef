/* Copyright (c) 2024-2026 Voxgig Ltd, MIT License */


import { test, describe } from 'node:test'
import assert from 'node:assert'


import {
  topTransform
} from '../../dist/transform/top'


import {
  KIT
} from '../../dist/types'


function makeCtx(def: any): any {
  return {
    apimodel: { main: { [KIT]: {} } },
    def,
    log: { info: () => {}, debug: () => {}, warn: () => {} },
  }
}


describe('transform-top servers[].url scheme normalisation', () => {

  test('passes through already-schemed URLs', async () => {
    const ctx = makeCtx({ info: {}, servers: [{ url: 'https://api.example.com/v1' }] })
    await topTransform(ctx)
    assert.deepStrictEqual(
      ctx.apimodel.main[KIT].info.servers[0].url,
      'https://api.example.com/v1',
    )
  })

  test('prepends https:// when scheme is missing', async () => {
    const ctx = makeCtx({ info: {}, servers: [{ url: 'api.artic.edu/api/v1' }] })
    await topTransform(ctx)
    assert.deepStrictEqual(
      ctx.apimodel.main[KIT].info.servers[0].url,
      'https://api.artic.edu/api/v1',
    )
  })

  test('preserves http:// when explicitly specified', async () => {
    const ctx = makeCtx({ info: {}, servers: [{ url: 'http://insecure.example/x' }] })
    await topTransform(ctx)
    assert.deepStrictEqual(
      ctx.apimodel.main[KIT].info.servers[0].url,
      'http://insecure.example/x',
    )
  })

  test('leaves relative URLs alone', async () => {
    // Relative server URLs (path-only) are valid per OpenAPI and mean
    // "same host as where the spec is served". Adding https:// would
    // turn `/v1` into `https:///v1` which is wrong.
    const ctx = makeCtx({ info: {}, servers: [{ url: '/v1' }] })
    await topTransform(ctx)
    assert.deepStrictEqual(
      ctx.apimodel.main[KIT].info.servers[0].url,
      '/v1',
    )
  })

  test('strips leading slash duplicates when prepending', async () => {
    const ctx = makeCtx({ info: {}, servers: [{ url: '//api.example/v1' }] })
    await topTransform(ctx)
    assert.deepStrictEqual(
      ctx.apimodel.main[KIT].info.servers[0].url,
      'https://api.example/v1',
    )
  })

  test('normalises every entry when multiple servers are listed', async () => {
    const ctx = makeCtx({
      info: {},
      servers: [
        { url: 'api.a/v1' },
        { url: 'https://api.b/v1' },
        { url: 'api.c/v1' },
      ],
    })
    await topTransform(ctx)
    const urls = ctx.apimodel.main[KIT].info.servers.map((s: any) => s.url)
    assert.deepStrictEqual(urls, [
      'https://api.a/v1',
      'https://api.b/v1',
      'https://api.c/v1',
    ])
  })

})
