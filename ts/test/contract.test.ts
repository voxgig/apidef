import { test } from 'node:test'
import assert from 'node:assert/strict'
import { contractTransform, contractJSON, graphqlInputTypes } from '../dist/transform/contract'
import { operationFacts } from '../dist/resolved'
import { cleanTransform } from '../dist/transform/clean'

for (const method of ['POST', 'QUERY']) test('lossless point contract ' + method, async () => {
  const schema = { type: 'object', additionalProperties: false, properties: {
    n: { type: 'integer', minimum: 1 }, nested: { type: 'array', minItems: 1, items: { oneOf: [{ type: 'string', enum: ['a','b'] }, { type: 'null' }] } }, secret: { type: 'string', writeOnly: true }, id: { type: 'string', readOnly: true },
  }, required: ['n'], example: {}, key$: 'internal' }
  const point: any = { method, orig: '/operation' }
  const ctx: any = { apimodel: { main: { kit: { entity: { item: { name: 'item', op: { create: { name: 'create', points: [point] } } } } } } }, guide: {}, def: {
    security: [{ bearer: [] }], paths: { '/operation': { [method.toLowerCase()]: {
      operationId: 'createItem', security: [], requestBody: { required: false, content: { 'application/json': { schema, example: {} } } }, responses: { '201': { content: { 'application/json': { schema } } } },
    } } },
  } }
  await contractTransform(ctx); await cleanTransform(ctx)
  const contract = ctx.apimodel.main.kit.entity.item.op.create.points[0].contract
  assert.equal(contract.version, 1); assert.equal(contract.id, method + ' /operation')

  // The facts are what the capability serves. The contract no longer carries
  // a serialised copy of them by default.
  const facts: any = operationFacts(ctx.def, point)
  assert.deepEqual(facts.security, []); assert.deepEqual(facts.requestBody.content['application/json'].example, {})
  assert.equal(facts.requestBody.content['application/json'].schema.properties.n.type, 'integer')
  // `$`-suffixed keys are stripped by the SERIALISER, not by fact gathering.
  const written: any = JSON.parse(contractJSON(facts))
  assert.equal(written.requestBody.content['application/json'].schema.key$, undefined)
  assert.equal(schema.key$, 'internal', 'Shared schema must stay untouched')
  assert.deepEqual(facts.requestBody.content['application/json'].schema.properties.n, { minimum: 1, type: 'integer' })
})
test('Swagger body, inherited security and guide recipe remain distinct', async () => {
  const point: any = { method: 'POST', orig: '/item' }
  const ctx: any = { apimodel: { main: { kit: { entity: { item: { name: 'item', op: { create: { name: 'create', points: [point] } } } } } } }, guide: { entity: { item: { path: { '/item': { op: { create: { live: { input: { n: 2 } }, contract: { security: [] } } } } } } } }, def: { swagger: '2.0', consumes: ['application/json'], security: [{ key: [] }], paths: { '/item': { post: { parameters: [{ in: 'body', schema: { type: 'object' } }] } } } } }
  await contractTransform(ctx)
  const facts: any = { ...operationFacts(ctx.def, point), live: point.live,
    security: [], factSources: { security: 'guide' } }
  assert.equal(point.contract.source, 'swagger2'); assert.deepEqual(facts.live.input, { n: 2 })
  assert.equal(facts.securitySource, 'definition'); assert.deepEqual(facts.security, []); assert.equal(facts.factSources.security, 'guide'); assert.deepEqual(facts.consumes, ['application/json'])
  assert.equal(facts.requestBody, undefined); assert.equal(facts.parameters[0].in, 'body')
})
test('GraphQL query and mutation argument facts survive without HTTP assumptions', async () => {
  for (const root of ['query','mutation']) {
    const point: any = { method: 'POST', orig: 'item', graphql: { doc: root + ' { item }' } }
    const ctx: any = { apimodel: { main: { kit: { entity: { item: { name: 'item', op: { load: { name: 'load', points: [point] } } } } } } }, def: { [root]: { item: { args: [{ name:'input', reqd:true, type:'Input' }] } }, types: { Input: { kind:'INPUT_OBJECT', fields: { count: { type:'Int' } } } } } }
    await contractTransform(ctx)
    const facts: any = operationFacts(ctx.def, point)
    assert.equal(facts.protocol, 'graphql'); assert.equal(facts.field.args[0].type, 'Input'); assert.equal(facts.types.Input.fields.count.type, 'Int')
  }
})

test('recursive resolved schemas retain local references without changing shared nodes', () => {
  const schema: any = { type: 'object', properties: {} }
  schema.properties.child = schema
  const source = { 'a/b~c': schema, second: schema }
  const facts = JSON.parse(contractJSON(source))
  assert.deepEqual(facts['a/b~c'].properties.child, { $ref: '#/a~1b~0c' })
  assert.deepEqual(facts.second.properties.child, { $ref: '#/second' })
  assert.equal(schema.properties.child, schema)
})
test('large GraphQL output catalogues do not multiply per-operation contract size', () => {
  const types: any = {
    Input: { kind: 'INPUT_OBJECT', fields: { nested: { type: 'Input' }, value: { type: 'Choice' } } },
    Choice: { kind: 'ENUM', values: ['A', 'B'] },
  }
  for (let i = 0; i < 2000; i++) types['Output' + i] = { kind: 'OBJECT', fields: { related: { type: 'Output' + ((i + 1) % 2000) } } }
  const selected = graphqlInputTypes({ args: [{ type: 'Input' }] }, types)
  assert.deepEqual(Object.keys(selected).sort(), ['Choice', 'Input'])
  assert.equal(selected.Input.fields.nested.type, 'Input')
  assert.ok(contractJSON(selected).length < 300)
})
