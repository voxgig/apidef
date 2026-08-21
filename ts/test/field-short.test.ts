/* Copyright (c) 2024 Voxgig Ltd, MIT License */

import { test, describe } from 'node:test'
import assert from 'node:assert'

import { fieldTransform } from '../dist/transform/field'


// The paths a spec's `description` takes to reach ModelField.short.
//
// The first cut of this feature read the description in resolveOpFields and
// stopped there, which covers the common case — one schema, one operation —
// and silently drops it in three others. Each test below is one of those.

function runFieldTransform(entity: any, def: any) {
  const apimodel = { main: { kit: { entity: { [entity.name]: entity } } } }
  return fieldTransform({ apimodel, def } as any).then(() => entity.fields)
}


function fieldsByName(fields: any[]) {
  const out: Record<string, any> = {}
  for (const f of fields) { out[f.name] = f }
  return out
}


describe('field-short', () => {

  // A field is first seen under a higher-precedence op that does not describe
  // it, and described under a later one. Field identity is first-writer-wins
  // (that is what `seen` is for) and mergeField carried only req/type, so the
  // description the spec DOES supply was thrown away and the generated
  // Description cell stayed blank.
  test('merge-keeps-first-description', async () => {
    const entity = {
      name: 'planet',
      fields: [] as any[],
      op: {
        // load comes first in opFieldPrecedence, and describes nothing.
        load: {
          name: 'load',
          points: [{ orig: '/planets/{id}', method: 'GET', kind: 'json' }],
        },
        // create describes both.
        create: {
          name: 'create',
          points: [{ orig: '/planets', method: 'POST', kind: 'json' }],
        },
      },
    }

    const undescribed = {
      type: 'object',
      properties: {
        id: { key$: 'id', type: 'string' },
        name: { key$: 'name', type: 'string' },
      },
    }

    const described = {
      type: 'object',
      properties: {
        id: { key$: 'id', type: 'string', description: 'Stable identifier.' },
        name: { key$: 'name', type: 'string', description: '  Common name.  ' },
      },
    }

    const def = {
      paths: {
        '/planets/{id}': {
          get: {
            responses: {
              200: { content: { 'application/json': { schema: undescribed } } },
            },
          },
        },
        '/planets': {
          post: {
            requestBody: { content: { 'application/json': { schema: described } } },
          },
        },
      },
    }

    const fields = fieldsByName(await runFieldTransform(entity, def))

    assert.strictEqual(fields.name.short, 'Common name.',
      'a later op\'s description must survive the merge, trimmed')
    assert.strictEqual(fields.id.short, 'Stable identifier.')
  })


  // The reverse: the FIRST description wins, and a later op must not overwrite
  // it. Precedence exists so that load/create describe the entity; without
  // this, whichever op happened to be last would decide.
  test('merge-does-not-overwrite-an-existing-description', async () => {
    const entity = {
      name: 'planet',
      fields: [] as any[],
      op: {
        load: {
          name: 'load',
          points: [{ orig: '/planets/{id}', method: 'GET', kind: 'json' }],
        },
        list: {
          name: 'list',
          points: [{ orig: '/planets', method: 'GET', kind: 'json' }],
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
                        name: { key$: 'name', type: 'string', description: 'The one that wins.' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        '/planets': {
          get: {
            responses: {
              200: {
                content: {
                  'application/json': {
                    schema: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          name: { key$: 'name', type: 'string', description: 'The one that loses.' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    }

    const fields = fieldsByName(await runFieldTransform(entity, def))

    assert.strictEqual(fields.name.short, 'The one that wins.')
  })


  // GraphQL field descriptions live on GqlField.desc — parse/graphql.ts puts
  // them there. findGraphqlFieldDefs built field defs with key$/type/required
  // only, so the description lookup in resolveOpFields always read undefined
  // and no GraphQL-sourced SDK ever got a Description column.
  test('graphql-description-reaches-short', async () => {
    const entity = {
      name: 'planet',
      orig$: 'Planet',
      fields: [] as any[],
      op: {
        load: {
          name: 'load',
          points: [{ kind: 'graphql', graphql: { entityType$: 'Planet' } }],
        },
      },
    }

    const def = {
      paths: {},
      types: {
        String: { name: 'String', kind: 'SCALAR', fields: {} },
        Planet: {
          name: 'Planet',
          kind: 'OBJECT',
          fields: {
            id: {
              name: 'id', gqltype: 'String!', type: 'String',
              reqd: true, list: false, args: [], deprecated: false,
            },
            name: {
              name: 'name', gqltype: 'String', type: 'String',
              reqd: false, list: false, args: [], deprecated: false,
              desc: '  Common name.  ',
            },
          },
        },
      },
    }

    const fields = fieldsByName(await runFieldTransform(entity, def))

    assert.strictEqual(fields.name.short, 'Common name.',
      'GqlField.desc must reach ModelField.short, trimmed')
    assert.strictEqual(fields.id.short, undefined,
      'an undescribed GraphQL field must not acquire an invented description')
  })

})
