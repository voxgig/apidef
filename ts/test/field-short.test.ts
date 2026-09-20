/* Copyright (c) 2024 Voxgig Ltd, MIT License */

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


describe('field-short', () => {

  // A field is first seen under a higher-precedence op that does not describe
  // it, and described under a later one. Field identity is first-writer-wins
  // (that is what `seen` is for) and mergeField carried only req/type, so the
  // description the spec DOES supply was thrown away and the generated
  // Description cell stayed blank.
  test('merge-keeps-first-description', async () => {
    const entity = {
      name: 'planet',
      fields: {} as Record<string, any>,
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

    assert.strictEqual(fields.name.sh, 'Common name.',
      'a later op\'s description must survive the merge, trimmed')
    assert.strictEqual(fields.id.sh, 'Stable identifier.')
  })


  // The reverse: the FIRST description wins, and a later op must not overwrite
  // it. Precedence exists so that load/create describe the entity; without
  // this, whichever op happened to be last would decide.
  test('merge-does-not-overwrite-an-existing-description', async () => {
    const entity = {
      name: 'planet',
      fields: {} as Record<string, any>,
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

    assert.strictEqual(fields.name.sh, 'The one that wins.')
  })


  test('graphql-description-reaches-short', async () => {
    const entity = {
      name: 'planet',
      orig$: 'Planet',
      fields: {} as Record<string, any>,
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

    assert.strictEqual(fields.name.sh, 'Common name.',
      'GqlField.desc must reach ModelField.sh, trimmed')
    assert.strictEqual(fields.id.sh, undefined,
      'an undescribed GraphQL field must not acquire an invented description')
  })


  test('short-is-reduced-to-one-capped-line', async () => {
    const bullets = [
      'The status of the user',
      '- `joined`, the user has joined the space',
      '- `invited`, the user has been sent an invitation',
    ].join('\n')

    const entity = {
      name: 'planet',
      fields: {} as Record<string, any>,
      op: {
        load: {
          name: 'load',
          points: [{ orig: '/planets/{id}', method: 'GET', kind: 'json' }],
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
                        status: { key$: 'status', type: 'string', description: bullets },
                        note: {
                          key$: 'note', type: 'string',
                          description: 'First sentence here. Second one should not appear.',
                        },
                        long: {
                          key$: 'long', type: 'string',
                          description: 'x'.repeat(400),
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

    for (const name of ['status', 'note', 'long']) {
      assert.ok(!fields[name].sh.includes('\n'),
        `${name}.sh must not contain a newline — it lands in a markdown table cell`)
    }

    assert.strictEqual(fields.status.sh,
      'The status of the user - `joined`, the user has joined the space - `invited`, the user has been sent an invitation',
      'newlines collapse to spaces rather than being dropped or truncating the text')

    assert.strictEqual(fields.note.sh, 'First sentence here.',
      'a description with real sentences is cut at the first one')

    assert.strictEqual(fields.long.sh.length, 240,
      'an over-long description is capped')
    assert.ok(fields.long.sh.endsWith('\u2026'),
      'the cap is marked with an ellipsis rather than cutting silently')
  })

})
