/* Copyright (c) 2026 Voxgig Ltd, MIT License */

import { test, describe } from 'node:test'
import assert from 'node:assert'

import { fieldTransform } from '../dist/transform/field'


// go/field_syn_test.go runs the same cases.

function seg(path: string) {
  return path.split('/').filter((p: string) => '' !== p).map((p: string) =>
    p.startsWith('{') ? { var: p.slice(1, -1) } : { lit: p })
}


function point(m: string, o: string, params: string[] = [], req?: string) {
  return {
    m, o, s: seg(o),
    g: { params: params.map((n: string) => ({ n, k: 'param', r: true, t: '`$STRING`' })) },
    ...(null == req ? {} : { t: { req, res: '`body`' } }),
  }
}


const record = (props: any) => ({ content: { 'application/json': { schema: {
  type: 'object', properties: props,
} } } })

const tagsBody = { content: { 'application/json': { schema: {
  type: 'array', items: { type: 'string' },
} } } }


async function fieldsOf(name: string, op: any, paths: any, guide?: any) {
  const ment: any = { name, fields: {}, op }
  await fieldTransform({
    apimodel: { main: { kit: { entity: { [name]: ment } } } },
    def: { paths },
    guide,
  } as any)
  return ment
}


describe('field-syn', () => {

  test('an id added for a composite identity is synthetic', async () => {
    const ment = await fieldsOf('repo',
      { load: { name: 'load', points: [point('GET', '/repos/{owner}/{repo}', ['owner', 'repo'])] } },
      { '/repos/{owner}/{repo}': { get: { responses: { 200: record({ name: { type: 'string' } }) } } } })
    assert.deepStrictEqual(ment.id.parts, ['owner', 'repo'])
    assert.strictEqual(ment.fields.id.syn, true)
    assert.strictEqual(ment.fields.name.syn, undefined)
  })


  test('an id added for the key the guide leaves when composite is off is synthetic', async () => {
    const ment = await fieldsOf('artifact',
      { load: { name: 'load', points: [
        point('GET', '/artifacts/{artifact_id}/{archive_format}', ['artifact_id', 'archive_format'])] } },
      { '/artifacts/{artifact_id}/{archive_format}': { get: { responses: { 200: { content: {} } } } } },
      { entity: { artifact: { id: { composite: false } } } })
    assert.strictEqual(ment.id.field, 'id')
    assert.strictEqual(ment.fields.id.syn, true)
  })


  test('an id added for a record addressed by an id parameter is synthetic', async () => {
    const ment = await fieldsOf('secret',
      { load: { name: 'load', points: [point('GET', '/secrets/{id}', ['id'])] } },
      { '/secrets/{id}': { get: { responses: { 200: record({ value: { type: 'string' } }) } } } })
    assert.strictEqual(ment.id.field, 'id')
    assert.strictEqual(ment.fields.id.syn, true)
  })


  test('an id the record declares is not synthetic', async () => {
    const ment = await fieldsOf('secret',
      { load: { name: 'load', points: [point('GET', '/secrets/{id}', ['id'])] } },
      { '/secrets/{id}': { get: { responses: { 200: record({
        id: { type: 'string' }, value: { type: 'string' } }) } } } })
    assert.strictEqual(ment.id.field, 'id')
    assert.strictEqual(ment.fields.id.syn, undefined)
  })


  test('the field an array body is sent from is synthetic', async () => {
    const ment = await fieldsOf('label',
      { create: { name: 'create', points: [point('POST', '/labels', [], '`reqdata.tags`')] } },
      { '/labels': { post: { requestBody: tagsBody, responses: { 201: { content: {} } } } } })
    assert.strictEqual(ment.fields.tags.syn, true)
  })


  test('a carrier a property also declares is not synthetic', async () => {
    const ment = await fieldsOf('label', {
      create: { name: 'create', points: [point('POST', '/labels', [], '`reqdata.tags`')] },
      list: { name: 'list', points: [point('GET', '/labels')] },
    }, { '/labels': {
      post: { requestBody: tagsBody, responses: { 201: { content: {} } } },
      get: { responses: { 200: { content: { 'application/json': { schema: {
        type: 'array', items: { type: 'object', properties: {
          name: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } } } } } } } } } },
    } })
    assert.strictEqual(ment.fields.tags.syn, undefined)
    assert.strictEqual(ment.fields.name.syn, undefined)
  })

})
