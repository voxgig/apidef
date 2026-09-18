/* Copyright (c) 2024-2026 Voxgig Ltd, MIT License */

import { test, describe } from 'node:test'
import assert from 'node:assert'

import { parse } from '../dist/apidef'


// See docs/design/derived-names.md

async function paths(spec: any) {
  const def: any = await parse('OpenAPI', JSON.stringify(spec), { file: 'test.json' })
  return Object.keys(def.paths)
}

function spec(pathmap: any) {
  return { openapi: '3.0.0', info: { title: 't', version: '1' }, paths: pathmap }
}

describe('colon-path-params', () => {

  test('rewrites a declared colon parameter to brace form', async () => {
    assert.deepEqual(await paths(spec({
      '/pwa/v3/projects/:project_slug/email_templates': {
        parameters: [{ in: 'path', name: 'project_slug', required: true }],
        get: { responses: {} },
      },
    })), ['/pwa/v3/projects/{project_slug}/email_templates'])
  })

  test('takes the declaration from the operation, not just the path item', async () => {
    assert.deepEqual(await paths(spec({
      '/projects/:slug/envs/:env': {
        get: {
          parameters: [{ in: 'path', name: 'slug' }, { in: 'path', name: 'env' }],
          responses: {},
        },
      },
    })), ['/projects/{slug}/envs/{env}'])
  })

  test('leaves a Google-style custom method alone', async () => {
    // `:activate` is part of the resource name and no such parameter is
    // declared, so rewriting it would invent a parameter the API has not got.
    assert.deepEqual(await paths(spec({
      '/users/{id}:activate': {
        post: { parameters: [{ in: 'path', name: 'id' }], responses: {} },
      },
    })), ['/users/{id}:activate'])
  })

  test('leaves an undeclared colon segment alone', async () => {
    assert.deepEqual(await paths(spec({
      '/reports/:latest': { get: { responses: {} } },
    })), ['/reports/:latest'])
  })

  test('does not disturb paths that already use brace form', async () => {
    assert.deepEqual(await paths(spec({
      '/users/{id}': { get: { parameters: [{ in: 'path', name: 'id' }], responses: {} } },
      '/plain/path': { get: { responses: {} } },
    })), ['/users/{id}', '/plain/path'])
  })

  test('a query parameter of the same name does not count', async () => {
    // Only `in: path` declares a path parameter; a query parameter that
    // happens to share the name says nothing about the URL's shape.
    assert.deepEqual(await paths(spec({
      '/search/:mode': { get: { parameters: [{ in: 'query', name: 'mode' }], responses: {} } },
    })), ['/search/:mode'])
  })

})
