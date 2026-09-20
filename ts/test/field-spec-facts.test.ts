/* Copyright (c) 2024-2026 Voxgig Ltd, MIT License */

import { test, describe } from 'node:test'
import assert from 'node:assert'

import { fieldTransform } from '../dist/transform/field'



function runFieldTransform(entity: any, def: any) {
  const apimodel = { main: { kit: { entity: { [entity.name]: entity } } } }
  return fieldTransform({ apimodel, def } as any).then(() => entity.fields)
}


function fieldsByName(fields: Record<string, any>) {
  const out: Record<string, any> = {}
  for (const f of Object.values(fields)) { out[f.n] = f }
  return out
}


function loadOnly(schema: any) {
  return {
    entity: {
      name: 'planet',
      fields: {} as Record<string, any>,
      op: {
        load: {
          name: 'load',
          points: [{ orig: '/planets/{id}', method: 'GET', kind: 'json' }],
        },
      },
    },
    def: {
      paths: {
        '/planets/{id}': {
          get: {
            responses: {
              200: { content: { 'application/json': { schema } } },
            },
          },
        },
      },
    },
  }
}


describe('field-spec-facts', () => {

  test('entity fields use compact attributes and preserve schema facts', async () => {
    const { entity, def } = loadOnly({
      type: 'object',
      properties: {
        id: {
          key$: 'id', type: 'string', required: true,
          description: 'Stable identifier. More details.',
          readOnly: true, writeOnly: true, deprecated: true, format: ' uuid ',
        },
      },
    })
    const property = def.paths['/planets/{id}'].get.responses[200].content['application/json'].schema.properties.id
    const before = JSON.stringify(property)
    const fields = await runFieldTransform(entity, def)
    assert.deepStrictEqual(fields, { id: {
      n: 'id', h: 'Id', t: '`$STRING`', r: true, op: {},
      sh: 'Stable identifier.', ro: true, wo: true, de: true, fo: 'uuid',
    } })
    assert.strictEqual(JSON.stringify(property), before)
  })


  test('fields are keyed by wire name with derived titles', async () => {
    const { entity, def } = loadOnly({
      type: 'object',
      properties: Object.fromEntries(['userName', 'created_at', 'constructor', 'active'].map(n =>
        [n, { key$: n, type: 'string' }])),
    })
    const fields = await runFieldTransform(entity, def)
    assert.strictEqual(Array.isArray(fields), false)
    assert.deepStrictEqual(Object.keys(fields), ['active', 'constructor', 'created_at', 'userName'])
    assert.deepStrictEqual(Object.values(fields).map((f: any) => [f.n, f.h]), [
      ['active', 'Active'], ['constructor', 'Constructor'],
      ['created_at', 'Created At'], ['userName', 'User Name'],
    ])
  })


  test('the four keywords are carried through', async () => {
    const { entity, def } = loadOnly({
      type: 'object',
      properties: {
        id: { key$: 'id', type: 'string', readOnly: true },
        secret: { key$: 'secret', type: 'string', writeOnly: true },
        legacy: { key$: 'legacy', type: 'string', deprecated: true },
        created: { key$: 'created', type: 'string', format: 'date-time' },
      },
    })

    const fields = fieldsByName(await runFieldTransform(entity, def))

    assert.strictEqual(fields.id.ro, true,
      'readOnly is the whole point of this change')
    assert.strictEqual(fields.secret.wo, true)
    assert.strictEqual(fields.legacy.de, true)
    assert.strictEqual(fields.created.fo, 'date-time')
  })


  test('a false or absent keyword adds no key', async () => {
    const { entity, def } = loadOnly({
      type: 'object',
      properties: {
        plain: { key$: 'plain', type: 'string' },
        stated: {
          key$: 'stated', type: 'string',
          readOnly: false, writeOnly: false, deprecated: false,
        },
      },
    })

    const fields = fieldsByName(await runFieldTransform(entity, def))

    for (const name of ['plain', 'stated']) {
      for (const key of ['ro', 'wo', 'de', 'fo']) {
        assert.ok(!(key in fields[name]),
          name + ': ' + key + ' was emitted for a field the spec did not flag')
      }
    }
  })


  // A non-string or blank `format` is not a format.
  test('a blank or non-string format is not carried', async () => {
    const { entity, def } = loadOnly({
      type: 'object',
      properties: {
        blank: { key$: 'blank', type: 'string', format: '   ' },
        wrong: { key$: 'wrong', type: 'string', format: 7 },
        real: { key$: 'real', type: 'string', format: '  password  ' },
      },
    })

    const fields = fieldsByName(await runFieldTransform(entity, def))

    assert.ok(!('fo' in fields.blank))
    assert.ok(!('fo' in fields.wrong))
    assert.strictEqual(fields.real.fo, 'password',
      'a real format is trimmed, like short')
  })


  test('an annotation on a later op survives the merge', async () => {
    const entity = {
      name: 'planet',
      fields: {} as Record<string, any>,
      op: {
        // load comes first in opFieldPrecedence and annotates nothing.
        load: {
          name: 'load',
          points: [{ orig: '/planets/{id}', method: 'GET', kind: 'json' }],
        },
        create: {
          name: 'create',
          points: [{ orig: '/planets', method: 'POST', kind: 'json' }],
        },
      },
    }

    const bare = {
      type: 'object',
      properties: {
        id: { key$: 'id', type: 'string' },
        token: { key$: 'token', type: 'string' },
      },
    }

    const annotated = {
      type: 'object',
      properties: {
        id: { key$: 'id', type: 'string', readOnly: true },
        token: { key$: 'token', type: 'string', format: 'password', writeOnly: true },
      },
    }

    const def = {
      paths: {
        '/planets/{id}': {
          get: {
            responses: { 200: { content: { 'application/json': { schema: bare } } } },
          },
        },
        '/planets': {
          post: {
            requestBody: { content: { 'application/json': { schema: annotated } } },
          },
        },
      },
    }

    const fields = fieldsByName(await runFieldTransform(entity, def))

    assert.strictEqual(fields.id.ro, true,
      'a later op\'s readOnly must survive the merge')
    assert.strictEqual(fields.token.wo, true)
    assert.strictEqual(fields.token.fo, 'password')
  })


  test('a readOnly response beats a request that omits it', async () => {
    const entity = {
      name: 'planet',
      fields: {} as Record<string, any>,
      op: {
        load: {
          name: 'load',
          points: [{ orig: '/planets/{id}', method: 'GET', kind: 'json' }],
        },
        create: {
          name: 'create',
          points: [{ orig: '/planets', method: 'POST', kind: 'json' }],
        },
      },
    }

    const def = {
      paths: {
        '/planets/{id}': {
          get: {
            responses: {
              200: {
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        id: { key$: 'id', type: 'string', readOnly: true },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        '/planets': {
          post: {
            requestBody: {
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: { id: { key$: 'id', type: 'string' } },
                  },
                },
              },
            },
          },
        },
      },
    }

    const fields = fieldsByName(await runFieldTransform(entity, def))

    assert.strictEqual(fields.id.ro, true,
      'the restriction lost to a schema that merely omitted it')
  })


  test('the parsed schema keeps its own keys', async () => {
    const schema = {
      type: 'object',
      properties: {
        id: { key$: 'id', type: 'string', readOnly: true },
      },
    }

    const own = (o: any): any =>
      null == o || 'object' !== typeof o ? o :
        Array.isArray(o) ? o.map(own) :
          Object.fromEntries(Object.entries(o)
            .filter(([k]) => !k.endsWith('$'))
            .map(([k, v]) => [k, own(v)]))

    const before = JSON.stringify(own(schema))

    const { entity, def } = loadOnly(schema)
    await runFieldTransform(entity, def)

    assert.strictEqual(JSON.stringify(own(schema)), before,
      'the transform wrote back onto the shared schema')
  })
})
