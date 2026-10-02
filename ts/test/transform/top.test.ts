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


describe('transform-top security', () => {

  const CF_SCHEMES = {
    api_email: { type: 'apiKey', in: 'header', name: 'X-Auth-Email' },
    api_key: { type: 'apiKey', in: 'header', name: 'X-Auth-Key' },
    api_token: { type: 'http', scheme: 'bearer' },
  }

  test('a first entry needing a scheme set gives way to a single scheme', async () => {
    const ctx = makeCtx({
      info: {},
      security: [{ api_email: [], api_key: [] }, { api_token: [] }],
      paths: { '/zones': { get: {} } },
      components: { securitySchemes: CF_SCHEMES },
    })
    await topTransform(ctx)
    const security = ctx.apimodel.main[KIT].info.security
    assert.deepStrictEqual(
      [security.scheme, security.in, security.name, security.prefix],
      ['api_token', 'header', 'Authorization', 'Bearer'])
    assert.deepStrictEqual(
      security.alternatives.map((set: any[]) => set.map((s) => s.name)),
      [['X-Auth-Email', 'X-Auth-Key']])
  })

  test('the scheme every operation names first outranks the definition', async () => {
    const ops = { security: [{ api_token: [] }, { api_email: [], api_key: [] }] }
    const ctx = makeCtx({
      info: {},
      security: [{ api_email: [] }],
      paths: { '/zones': { get: ops, post: ops } },
      components: { securitySchemes: CF_SCHEMES },
    })
    await topTransform(ctx)
    const security = ctx.apimodel.main[KIT].info.security
    assert.strictEqual(security.scheme, 'api_token')
    assert.deepStrictEqual(
      security.alternatives.map((set: any[]) => set.map((s) => s.scheme)),
      [['api_email', 'api_key']])
  })

  test('a declared scheme no operation applies is still the credential', async () => {
    const ctx = makeCtx({
      info: {},
      paths: { '/api/gettext': { get: {} } },
      components: {
        securitySchemes: {
          ApiKeyAuth: { type: 'apiKey', in: 'query', name: 'apikey' },
          SubscriberAuth: { type: 'http', scheme: 'basic' },
        },
      },
    })
    await topTransform(ctx)
    const info = ctx.apimodel.main[KIT].info
    assert.strictEqual(info.auth, undefined)
    assert.deepStrictEqual(info.security, {
      scheme: 'ApiKeyAuth', type: 'apiKey', in: 'query', name: 'apikey', prefix: '',
    })
  })

  test('a definition declaring no auth is public', async () => {
    const ctx = makeCtx({ info: {}, paths: { '/x': { get: {} } } })
    await topTransform(ctx)
    const info = ctx.apimodel.main[KIT].info
    assert.strictEqual(info.auth, false)
    assert.strictEqual(info.security, undefined)
  })

  test('the token exchange sits beside the chosen scheme', async () => {
    const def = {
      info: { title: 'T' },
      security: [{ bearerAuth: [] }],
      paths: {
        '/auth/token': {
          post: {
            security: [],
            responses: {
              200: {
                content: {
                  'application/json': {
                    schema: { type: 'object', properties: { access_token: { type: 'string' } } },
                  },
                },
              },
            },
          },
        },
      },
      components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } } },
    }
    const ctx = makeCtx(def)
    await topTransform(ctx)
    assert.deepStrictEqual(ctx.apimodel.main[KIT].info.security, {
      scheme: 'bearerAuth', type: 'http', in: 'header', name: 'Authorization', prefix: 'Bearer',
      exchange: { path: 'auth/token', method: 'POST', response: 'access_token' },
    })
    assert.deepStrictEqual(Object.keys(def.info), ['title'])
  })

})
