import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { fieldTransform } from '../dist/transform/field'

const lines = readFileSync(join(__dirname, '../test/field-nullable.tsv'), 'utf8').trim().split(/\r?\n/)
const rows = lines.slice(1).map(line => line.split('\t'))

// A schema is a record's property, read by every operation, unless its row
// puts it at `body`: a JSON request body, sent from one field.
const RECORD_OPS = [['load', 'GET'], ['list', 'GET'], ['create', 'POST'], ['update', 'PUT']]
const BODY_OPS = [['create', 'POST'], ['update', 'PUT']]

describe('field-nullable', () => {
  test('has cases', () => assert.ok(rows.length > 0))

  for (const [name, source, expected, field, at] of rows) {
    const key = field || 'value'
    const body = 'body' === at
    for (const [op, method] of body ? BODY_OPS : RECORD_OPS) {
      test(name + ': ' + op, async () => {
        const property = JSON.parse(source)
        const point: any = { o: '/things', m: method, k: 'json' }
        let schema: any = property
        if (body) {
          point.t = { req: '`reqdata.' + key + '`' }
        }
        else {
          property.key$ = key
          const record = { type: 'object', required: [key], properties: {
            [key]: property, label: { type: 'string' },
          } }
          schema = 'list' === op ? { type: 'array', items: record } : record
        }
        const content = { content: { 'application/json': { schema } } }
        const opdef = ['create', 'update'].includes(op) ?
          { requestBody: content } : { responses: { 200: content } }
        const entity: any = { name: 'thing', fields: {}, op: { [op]: { name: op, points: [point] } } }
        const def = { paths: { '/things': { [method.toLowerCase()]: opdef } } }
        // A body is listed beside the response it is read with, which numbers it.
        const facts = () => JSON.stringify({ ...property, index$: undefined })
        const before = facts()

        await fieldTransform({ apimodel: { main: { kit: { entity: { thing: entity } } } }, def } as any)

        assert.deepEqual(entity.fields[key].t, JSON.parse(expected))
        assert.equal(entity.fields[key].r, !body)
        assert.equal(facts(), before)
      })
    }
  }
})
