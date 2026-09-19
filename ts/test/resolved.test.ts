/* Copyright (c) 2024-2026 Voxgig Ltd, MIT License */

import { test, describe } from 'node:test'
import assert from 'node:assert'

import { parse } from '../dist/apidef'
import { contractTransform } from '../dist/transform/contract'
import { operationFacts, operationIndex, makeResolved, publishResolved, resolvedSpec }
  from '../dist/resolved'


const SPEC = {
  openapi: '3.0.0',
  info: { title: 't', version: '1' },
  security: [{ apiKeyAuth: [] }],
  components: { securitySchemes: { apiKeyAuth: { type: 'http', scheme: 'bearer' } } },
  paths: {
    '/things/{id}': {
      parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
      get: {
        operationId: 'getThing',
        parameters: [{ in: 'query', name: 'expand', schema: { type: 'string' } }],
        responses: { 200: { description: 'ok' } },
      },
      delete: { security: [], responses: { 204: { description: 'gone' } } },
    },
    '/open': { get: { responses: { 200: { description: 'ok' } } } },
  },
}


describe('resolved', () => {

  test('merges path-level and operation-level parameters', () => {
    const facts: any = operationFacts(SPEC, { method: 'GET', orig: '/things/{id}' })
    assert.deepEqual(facts.parameters.map((p: any) => p.name), ['id', 'expand'])
  })

  test('defaults security from the document and says where it came from', () => {
    const get: any = operationFacts(SPEC, { method: 'GET', orig: '/things/{id}' })
    assert.deepEqual(get.security, [{ apiKeyAuth: [] }])
    assert.equal(get.securitySource, 'definition')

    // An operation that overrides with [] needs NO auth — a distinction the
    // model's single resolved `kit.info.security` cannot express.
    const del: any = operationFacts(SPEC, { method: 'DELETE', orig: '/things/{id}' })
    assert.deepEqual(del.security, [])
    assert.equal(del.securitySource, 'operation')
  })

  test('carries securitySchemes under either specification spelling', () => {
    const oas3: any = operationFacts(SPEC, { method: 'GET', orig: '/open' })
    assert.deepEqual(Object.keys(oas3.securitySchemes), ['apiKeyAuth'])

    const swagger2: any = operationFacts({
      swagger: '2.0',
      securityDefinitions: { basic: { type: 'basic' } },
      paths: { '/x': { get: { responses: {} } } },
    }, { method: 'GET', orig: '/x' })
    assert.deepEqual(Object.keys(swagger2.securitySchemes), ['basic'])
  })

  test('is undefined for an operation the definition does not describe', () => {
    assert.equal(operationFacts(SPEC, { method: 'PUT', orig: '/things/{id}' }), undefined)
    assert.equal(operationFacts(SPEC, { method: 'GET', orig: '/nope' }), undefined)
  })

  test('indexes every described operation by method and path', () => {
    assert.deepEqual(Object.keys(operationIndex(SPEC)).sort(),
      ['DELETE /things/{id}', 'GET /open', 'GET /things/{id}'])
  })

  test('publishes onto the shared build context, and reads back', () => {
    const buildctx: any = { step: 'pre', state: {} }
    publishResolved(buildctx, 'openapi3', SPEC)

    // @voxgig/model mutates step on ONE context object, so what the pre step
    // publishes is what the post step reads.
    buildctx.step = 'post'
    const back = resolvedSpec(buildctx)
    assert.equal(back?.kind, 'openapi3')
    assert.equal(back?.operation('GET', '/things/{id}')?.operationId, 'getThing')
  })

  test('publishing without a build context still returns the capability', () => {
    // apidef also runs outside a model build.
    const r = publishResolved(undefined, 'openapi3', SPEC)
    assert.equal(r.operation('GET', '/open')?.protocol, 'http')
    assert.equal(resolvedSpec(undefined), undefined)
  })

  test('the definition it carries is the PARSED one, not the file', async () => {
    // A colon-style path is normalised during parse; a consumer reading the
    // raw file would miss every lookup on such a specification.
    const raw = JSON.stringify({
      openapi: '3.0.0', info: { title: 't', version: '1' },
      paths: {
        '/projects/:slug': {
          get: { parameters: [{ in: 'path', name: 'slug' }], responses: {} },
        },
      },
    })
    const def: any = await parse('OpenAPI', raw, { file: 'test.json' })
    const r = makeResolved('openapi3', def)
    assert.equal(r.operation('GET', '/projects/{slug}')?.protocol, 'http')
    assert.equal(r.operation('GET', '/projects/:slug'), undefined)
  })

})


// The guide's hint, not a specification fact, so it must survive on the point.
describe('live-hint-on-point', () => {

  test('a guide live hint lands on the point', async () => {
    const point: any = { method: 'GET', orig: '/things', kind: 'http' }
    const ctx: any = {
      def: { paths: { '/things': { get: { responses: {} } } } },
      apimodel: { main: { kit: { entity: { thing: { name: 'thing',
        op: { list: { name: 'list', points: [point] } } } } } } },
      guide: { entity: { thing: { path: { '/things': { op: { list: { live: true } } } } } } },
    }

    await contractTransform(ctx)

    assert.equal(point.live, true)

    assert.equal(point.contract.json, undefined)
    assert.equal(point.contract.id, 'GET /things')
  })

  test('no hint leaves the point alone', async () => {
    const point: any = { method: 'GET', orig: '/things', kind: 'http' }
    const ctx: any = {
      def: { paths: { '/things': { get: { responses: {} } } } },
      apimodel: { main: { kit: { entity: { thing: { name: 'thing',
        op: { list: { name: 'list', points: [point] } } } } } } },
      guide: {},
    }

    await contractTransform(ctx)

    assert.equal(point.live, undefined)
  })

})
