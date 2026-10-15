import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { fieldTransform } from '../dist/transform/field'

const lines = readFileSync(join(__dirname, '../test/field-nullable.tsv'), 'utf8').trim().split(/\r?\n/)
const rows = lines.slice(1).map(line => line.split('\t'))

describe('field-nullable', () => {
  test('has cases', () => assert.ok(rows.length > 0))

  for (const [name, source, expected] of rows) {
    for (const [op, method] of [['load', 'GET'], ['list', 'GET'], ['create', 'POST'], ['update', 'PUT']]) {
      test(name + ': ' + op, async () => {
        const property = JSON.parse(source)
        property.key$ = 'value'
        const record = { type: 'object', required: ['value'], properties: {
          value: property, label: { type: 'string' },
        } }
        const schema = 'list' === op ? { type: 'array', items: record } : record
        const body = { content: { 'application/json': { schema } } }
        const opdef = ['create', 'update'].includes(op) ?
          { requestBody: body } : { responses: { 200: body } }
        const entity: any = { name: 'thing', fields: {},
          op: { [op]: { name: op, points: [{ o: '/things', m: method, k: 'json' }] } },
        }
        const def = { paths: { '/things': { [method.toLowerCase()]: opdef } } }
        const before = JSON.stringify(property)

        await fieldTransform({ apimodel: { main: { kit: { entity: { thing: entity } } } }, def } as any)

        assert.deepEqual(entity.fields.value.t, JSON.parse(expected))
        assert.equal(entity.fields.value.r, true)
        assert.equal(JSON.stringify(property), before)
      })
    }
  }
})
