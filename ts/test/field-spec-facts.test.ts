/* Copyright (c) 2024-2026 Voxgig Ltd, MIT License */

import { test, describe } from 'node:test'
import assert from 'node:assert'

import { fieldTransform } from '../dist/transform/field'


// The four OpenAPI property keywords that now reach ModelField:
// `readOnly`, `writeOnly`, `deprecated` and `format`.
//
// They were being dropped, and `readOnly` is the expensive one to drop: it is
// the only statement in a spec of whether a client MAY send a field, so
// without it every generated create/update type offers the caller fields the
// server assigns. The tests below pin the three decisions that make up the
// feature — what is carried, what is deliberately NOT emitted, and how two
// disagreeing schemas resolve.
//
// Shaped after field-short.test.ts, which covers the same paths for
// `description`; the merge rule is deliberately the same one.

function runFieldTransform(entity: any, def: any) {
  const apimodel = { main: { kit: { entity: { [entity.name]: entity } } } }
  return fieldTransform({ apimodel, def } as any).then(() => entity.fields)
}


function fieldsByName(fields: any[]) {
  const out: Record<string, any> = {}
  for (const f of fields) { out[f.name] = f }
  return out
}


// One entity with one GET, whose 200 response carries `schema`.
function loadOnly(schema: any) {
  return {
    entity: {
      name: 'planet',
      fields: [] as any[],
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

    assert.strictEqual(fields.id.readOnly, true,
      'readOnly is the whole point of this change')
    assert.strictEqual(fields.secret.writeOnly, true)
    assert.strictEqual(fields.legacy.deprecated, true)
    assert.strictEqual(fields.created.format, 'date-time')
  })


  // ABSENT AND EXPLICIT-FALSE MEAN THE SAME THING, so only true is emitted.
  //
  // Each keyword defaults to false in OpenAPI. Emitting the false ones would
  // add three keys to every field of every model and say nothing that the
  // absence did not already say — and it would move every golden in this
  // repo, which is a large diff carrying no information.
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
      for (const key of ['readOnly', 'writeOnly', 'deprecated', 'format']) {
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

    assert.ok(!('format' in fields.blank))
    assert.ok(!('format' in fields.wrong))
    assert.strictEqual(fields.real.format, 'password',
      'a real format is trimmed, like short')
  })


  // THE MERGE, which is where a real spec differs from a constructed one.
  //
  // A field is first seen under a higher-precedence op that references a bare
  // component, and annotated under a later one. Identity is first-writer-wins,
  // so without a merge rule the annotation is thrown away — exactly the bug
  // that left every Description cell blank before `short` was merged.
  test('an annotation on a later op survives the merge', async () => {
    const entity = {
      name: 'planet',
      fields: [] as any[],
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

    assert.strictEqual(fields.id.readOnly, true,
      'a later op\'s readOnly must survive the merge')
    assert.strictEqual(fields.token.writeOnly, true)
    assert.strictEqual(fields.token.format, 'password')
  })


  // TWO SCHEMAS THAT DISAGREE, resolved toward the restriction.
  //
  // A response marks the field readOnly and a request body lists it as an
  // ordinary property. That spec contradicts itself — OpenAPI says a client
  // must not send a readOnly property at all — and the first declaration in
  // opFieldPrecedence order wins, which puts `load` (the response) first.
  //
  // That is the safe direction, and the reason is asymmetric: believing the
  // restriction costs a caller one field they probably could have sent;
  // believing the omission sends a value the server rejects.
  test('a readOnly response beats a request that omits it', async () => {
    const entity = {
      name: 'planet',
      fields: [] as any[],
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

    assert.strictEqual(fields.id.readOnly, true,
      'the restriction lost to a schema that merely omitted it')
  })


  // The parsed schema is SHARED across every operation that references it, so
  // nothing here may write a per-operation value back onto it — the hazard
  // findFieldDefs already carries a comment about for `required`.
  //
  // Compared with the ITERATION METADATA stripped. `each` stamps `index$` on
  // every object it walks, which is the traversal helper's business and not
  // this transform writing anything; asserting on the raw JSON would fail on
  // that and say "mutated" about a key no operation reads.
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
