import { test } from 'node:test'
import assert from 'node:assert/strict'
import { contractTransform } from '../dist/transform/contract'
import { operationFacts } from '../dist/resolved'
import { cleanTransform } from '../dist/transform/clean'

for (const method of ['POST', 'QUERY']) test('point contract contains only identity ' + method, async () => {
  const schema = { type: 'object', additionalProperties: false, properties: {
    n: { type: 'integer', minimum: 1 }, nested: { type: 'array', minItems: 1, items: { oneOf: [{ type: 'string', enum: ['a','b'] }, { type: 'null' }] } }, secret: { type: 'string', writeOnly: true }, id: { type: 'string', readOnly: true },
  }, required: ['n'], example: {}, key$: 'internal' }
  const point: any = { m: method, o: '/operation' }
  const ctx: any = { opts: { contractJson: true }, apimodel: { main: { kit: { entity: { item: { name: 'item', op: { create: { name: 'create', points: [point] } } } } } } }, guide: {}, def: {
    security: [{ bearer: [] }], paths: { '/operation': { [method.toLowerCase()]: {
      operationId: 'createItem', security: [], requestBody: { required: false, content: { 'application/json': { schema, example: {} } } }, responses: { '201': { content: { 'application/json': { schema } } } },
    } } },
  } }
  await contractTransform(ctx); await cleanTransform(ctx)
  const contract = ctx.apimodel.main.kit.entity.item.op.create.points[0].co
  assert.deepEqual(contract, { version: 2, id: method + ' /operation', source: 'openapi3' })

  const facts: any = operationFacts(ctx.def, point)
  assert.deepEqual(facts.security, []); assert.deepEqual(facts.requestBody.content['application/json'].example, {})
  assert.equal(facts.requestBody.content['application/json'].schema.properties.n.type, 'integer')
  assert.equal(schema.key$, 'internal', 'Shared schema must stay untouched')
  assert.deepEqual(facts.requestBody.content['application/json'].schema.properties.n, { minimum: 1, type: 'integer' })
})
test('Swagger body, inherited security and guide recipe remain distinct', async () => {
  const point: any = { m: 'POST', o: '/item' }
  const ctx: any = { apimodel: { main: { kit: { entity: { item: { name: 'item', op: { create: { name: 'create', points: [point] } } } } } } }, guide: { entity: { item: { path: { '/item': { op: { create: { live: { input: { n: 2 } } } } } } } } }, def: { swagger: '2.0', consumes: ['application/json'], security: [{ key: [] }], paths: { '/item': { post: { parameters: [{ in: 'body', schema: { type: 'object' } }] } } } } }
  await contractTransform(ctx)
  const facts: any = operationFacts(ctx.def, point)
  assert.equal(point.co.source, 'swagger2'); assert.deepEqual(point.li.input, { n: 2 })
  assert.equal(facts.securitySource, 'definition'); assert.deepEqual(facts.security, [{ key: [] }]); assert.deepEqual(facts.consumes, ['application/json'])
  assert.equal(facts.requestBody, undefined); assert.equal(facts.parameters[0].in, 'body')
})
test('GraphQL query and mutation argument facts survive without HTTP assumptions', async () => {
  for (const root of ['query','mutation']) {
    const point: any = { m: 'POST', o: 'item', gq: { doc: root + ' { item }' } }
    const ctx: any = { apimodel: { main: { kit: { entity: { item: { name: 'item', op: { load: { name: 'load', points: [point] } } } } } } }, def: { [root]: { item: { args: [{ name:'input', reqd:true, type:'Input' }] } }, types: { Input: { kind:'INPUT_OBJECT', fields: { count: { type:'Int' } } } } } }
    await contractTransform(ctx)
    assert.deepEqual(point.co, { version: 2, id: 'POST item', source: 'graphql' })
    assert.equal(point.gq.doc, root + ' { item }')
    const facts: any = operationFacts(ctx.def, point)
    assert.equal(facts.protocol, 'graphql'); assert.equal(facts.field.args[0].type, 'Input'); assert.equal(facts.types.Input.fields.count.type, 'Int')
  }
})

test('recursive schemas stay in the definition and the model remains serialisable', async () => {
  const schema: any = { type: 'object', properties: {} }
  schema.properties.child = schema
  const point: any = { m: 'POST', o: '/item', co: { json: 'stale' } }
  const ctx: any = {
    opts: { contractJson: true },
    def: { paths: { '/item': { post: { requestBody: { schema } } } } },
    apimodel: { main: { kit: { entity: { item: { name: 'item', op: {
      create: { name: 'create', points: [point] },
    } } } } } },
  }
  await contractTransform(ctx)
  await cleanTransform(ctx)
  assert.deepEqual(point.co, { version: 2, id: 'POST /item', source: 'openapi3' })
  assert.doesNotThrow(() => JSON.stringify(ctx.apimodel))
  assert.equal(schema.properties.child, schema)
  assert.equal(operationFacts(ctx.def, point)?.requestBody.schema, schema)
})
test('resolved GraphQL facts include only argument types', () => {
  const types: any = {
    Input: { kind: 'INPUT_OBJECT', fields: { nested: { type: 'Input' }, value: { type: 'Choice' } } },
    Choice: { kind: 'ENUM', values: ['A', 'B'] },
  }
  for (let i = 0; i < 2000; i++) types['Output' + i] = { kind: 'OBJECT', fields: { related: { type: 'Output' + ((i + 1) % 2000) } } }
  const facts = operationFacts({ query: { item: { args: [{ type: 'Input' }] } }, types },
    { m: 'POST', o: 'item' })!
  const selected = facts.types
  assert.deepEqual(Object.keys(selected).sort(), ['Choice', 'Input'])
  assert.equal(selected.Input.fields.nested.type, 'Input')
})
