/* Copyright (c) 2024-2026 Voxgig Ltd, MIT License */

import { test, describe } from 'node:test'
import assert from 'node:assert'

import { fieldTransform } from '../dist/transform/field'


function runFieldTransform(entity: any, def: any) {
  const apimodel = { main: { kit: { entity: { [entity.name]: entity } } } }
  return fieldTransform({ apimodel, def } as any).then(() => entity.fields)
}


const json = (schema: any) => ({ content: { 'application/json': { schema } } })

const prop = (key: string) => ({ key$: key, type: 'string' })

const props = (...keys: string[]) =>
  Object.fromEntries(keys.map((key) => [key, prop(key)]))


// One operation on /jobs, with the response and request schemas given.
function job(opname: string, method: string, response: any, request?: any) {
  const opdef: any = { responses: { 200: json(response) } }
  if (null != request) {
    opdef.requestBody = json(request)
  }
  return {
    entity: {
      name: 'job',
      fields: {} as Record<string, any>,
      op: { [opname]: { name: opname, points: [{ o: '/jobs', m: method, k: 'json' }] } },
    },
    def: { paths: { '/jobs': { [method.toLowerCase()]: opdef } } },
  }
}


function summary(fields: Record<string, any>) {
  return Object.keys(fields).sort().map((name) => name + (fields[name].r ? '!' : ''))
}


describe('field-allof', () => {

  test('a request schema composed with allOf contributes every member', async () => {
    const { entity, def } = job('create', 'POST',
      { type: 'object', properties: props('id') },
      { allOf: [
        { type: 'object', required: ['url'], properties: props('url') },
        { type: 'object', properties: props('formats') },
      ] })
    assert.deepStrictEqual(summary(await runFieldTransform(entity, def)),
      ['formats', 'id', 'url!'])
  })

  test('a response schema composed with allOf keeps its members beside a request body', async () => {
    const { entity, def } = job('create', 'POST',
      { allOf: [{ type: 'object', properties: props('id', 'status') }] },
      { type: 'object', properties: props('url') })
    assert.deepStrictEqual(summary(await runFieldTransform(entity, def)),
      ['id', 'status', 'url'])
  })

  test('a nested allOf member contributes its fields', async () => {
    const { entity, def } = job('load', 'GET',
      { allOf: [
        { allOf: [{ type: 'object', properties: props('id') }] },
        { type: 'object', properties: props('status') },
      ] })
    assert.deepStrictEqual(summary(await runFieldTransform(entity, def)),
      ['id', 'status'])
  })

  test('properties and required beside allOf apply to the composed schema', async () => {
    const { entity, def } = job('create', 'POST',
      { type: 'object', properties: props('id') },
      {
        type: 'object',
        required: ['url', 'name'],
        properties: props('name'),
        allOf: [{ type: 'object', properties: props('url', 'formats') }],
      })
    assert.deepStrictEqual(summary(await runFieldTransform(entity, def)),
      ['formats', 'id', 'name!', 'url!'])
  })

  test('a name one allOf member requires is required where a sibling declares it', async () => {
    const { entity, def } = job('create', 'POST',
      { type: 'object', properties: props('id') },
      { allOf: [
        { type: 'object', properties: props('url', 'formats') },
        { required: ['url'] },
        { allOf: [{ required: ['formats'] }] },
      ] })
    assert.deepStrictEqual(summary(await runFieldTransform(entity, def)),
      ['formats!', 'id', 'url!'])
  })

  test('a property declared beside allOf and in a member is one field with both facts', async () => {
    const { entity, def } = job('load', 'GET', {
      type: 'object',
      properties: { payload: { description: 'What the job carries.' } },
      allOf: [{
        type: 'object',
        required: ['payload'],
        properties: { payload: { type: 'object', format: 'job-payload' } },
      }],
    })
    const { payload } = await runFieldTransform(entity, def)
    assert.deepStrictEqual(
      { t: payload.t, r: payload.r, sh: payload.sh, fo: payload.fo, op: payload.op },
      { t: '`$OBJECT`', r: true, sh: 'What the job carries.', fo: 'job-payload', op: {} })
  })

  test('a property keeps its union, declared once or beside an annotation', async () => {
    const branch = (key: string) =>
      ({ type: 'object', properties: { [key]: { type: 'number' } } })
    const union = () => ({ oneOf: [branch('radius'), branch('side')] })
    for (const response of [
      { type: 'object', properties: { id: { type: 'string' }, shape: union() } },
      {
        type: 'object',
        properties: { id: { type: 'string' }, shape: { description: 'One of two shapes.' } },
        allOf: [{ type: 'object', properties: { shape: union() } }],
      },
    ]) {
      const { entity, def } = job('load', 'GET', response)
      const { shape } = await runFieldTransform(entity, def)
      assert.deepStrictEqual(
        { count: shape.union?.count, branches: shape.union?.branches },
        { count: 1, branches: 2 })
    }
  })

  test('a blank fact in one declaration leaves room for a later one', async () => {
    const { entity, def } = job('load', 'GET', {
      allOf: [
        { type: 'object', properties: { id: { type: 'string' }, notes: { type: 'string', description: ' ', format: '' } } },
        { type: 'object', properties: { notes: { description: 'Free text about the job.', format: 'markdown' } } },
      ],
    })
    const { notes } = await runFieldTransform(entity, def)
    assert.deepStrictEqual({ sh: notes.sh, fo: notes.fo }, { sh: 'Free text about the job.', fo: 'markdown' })
  })
})
