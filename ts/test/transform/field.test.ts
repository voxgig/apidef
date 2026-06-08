/* Copyright (c) 2024-2025 Voxgig Ltd, MIT License */

import { test, describe } from 'node:test'
import assert from 'node:assert'

import {
  inferFieldsFromExamples,
  inferTypeFromValue,
} from '../../dist/transform/field'


describe('transform-field', () => {

  test('inferTypeFromValue', () => {
    assert.deepStrictEqual(inferTypeFromValue('hello'),'string')
    assert.deepStrictEqual(inferTypeFromValue(''),'string')
    assert.deepStrictEqual(inferTypeFromValue(true),'boolean')
    assert.deepStrictEqual(inferTypeFromValue(false),'boolean')
    assert.deepStrictEqual(inferTypeFromValue(42),'integer')
    assert.deepStrictEqual(inferTypeFromValue(0),'integer')
    assert.deepStrictEqual(inferTypeFromValue(-1),'integer')
    assert.deepStrictEqual(inferTypeFromValue(3.14),'number')
    assert.deepStrictEqual(inferTypeFromValue(0.5),'number')
    assert.deepStrictEqual(inferTypeFromValue([1, 2]),'array')
    assert.deepStrictEqual(inferTypeFromValue([]),'array')
    assert.deepStrictEqual(inferTypeFromValue({ a: 1 }),'object')
    assert.deepStrictEqual(inferTypeFromValue({}),'object')
    assert.deepStrictEqual(inferTypeFromValue(null),'string')
    assert.deepStrictEqual(inferTypeFromValue(undefined),'string')
  })


  test('inferFieldsFromExamples - OpenAPI 3.x example object', () => {
    const opdef = {
      responses: {
        200: {
          content: {
            'application/json': {
              example: {
                id: 'abc-123',
                name: 'Test Item',
                count: 42,
                price: 9.99,
                active: true,
                tags: ['a', 'b'],
                meta: { key: 'val' },
              }
            }
          }
        }
      }
    }

    const fields = inferFieldsFromExamples(opdef)
    assert.deepStrictEqual(fields.length,7)

    const byName: Record<string, any> = {}
    for (const f of fields) { byName[(f as any).key$] = f }

    assert.deepStrictEqual(byName.id.type,'string')
    assert.deepStrictEqual(byName.name.type,'string')
    assert.deepStrictEqual(byName.count.type,'integer')
    assert.deepStrictEqual(byName.price.type,'number')
    assert.deepStrictEqual(byName.active.type,'boolean')
    assert.deepStrictEqual(byName.tags.type,'array')
    assert.deepStrictEqual(byName.meta.type,'object')
  })


  test('inferFieldsFromExamples - OpenAPI 3.x named examples', () => {
    const opdef = {
      responses: {
        200: {
          content: {
            'application/json': {
              examples: {
                'example1': {
                  value: {
                    id: 'x1',
                    title: 'First',
                    score: 88.5,
                  }
                },
                'example2': {
                  value: {
                    id: 'x2',
                    title: 'Second',
                    score: 91.0,
                  }
                }
              }
            }
          }
        }
      }
    }

    const fields = inferFieldsFromExamples(opdef)
    assert.deepStrictEqual(fields.length,3)

    const byName: Record<string, any> = {}
    for (const f of fields) { byName[(f as any).key$] = f }

    assert.deepStrictEqual(byName.id.type,'string')
    assert.deepStrictEqual(byName.title.type,'string')
    assert.deepStrictEqual(byName.score.type,'number')
  })


  test('inferFieldsFromExamples - Swagger 2.0 schema example', () => {
    const opdef = {
      responses: {
        200: {
          schema: {
            example: {
              username: 'admin',
              email: 'admin@test.com',
              is_active: true,
              login_count: 5,
            }
          }
        }
      }
    }

    const fields = inferFieldsFromExamples(opdef)
    assert.deepStrictEqual(fields.length,4)

    const byName: Record<string, any> = {}
    for (const f of fields) { byName[(f as any).key$] = f }

    assert.deepStrictEqual(byName.username.type,'string')
    assert.deepStrictEqual(byName.email.type,'string')
    assert.deepStrictEqual(byName.is_active.type,'boolean')
    assert.deepStrictEqual(byName.login_count.type,'integer')
  })


  test('inferFieldsFromExamples - array example unwraps to first item', () => {
    const opdef = {
      responses: {
        200: {
          content: {
            'application/json': {
              example: [
                { id: 1, name: 'first' },
                { id: 2, name: 'second' },
              ]
            }
          }
        }
      }
    }

    const fields = inferFieldsFromExamples(opdef)
    assert.deepStrictEqual(fields.length,2)

    const byName: Record<string, any> = {}
    for (const f of fields) { byName[(f as any).key$] = f }

    assert.deepStrictEqual(byName.id.type,'integer')
    assert.deepStrictEqual(byName.name.type,'string')
  })


  test('inferFieldsFromExamples - no responses returns empty', () => {
    assert.deepStrictEqual(inferFieldsFromExamples({}),[])
    assert.deepStrictEqual(inferFieldsFromExamples({ responses: {} }),[])
    assert.deepStrictEqual(inferFieldsFromExamples({ responses: { 404: {} } }),[])
  })


  test('inferFieldsFromExamples - 201 response', () => {
    const opdef = {
      responses: {
        201: {
          content: {
            'application/json': {
              example: {
                id: 'new-1',
                created: true,
              }
            }
          }
        }
      }
    }

    const fields = inferFieldsFromExamples(opdef)
    assert.deepStrictEqual(fields.length,2)

    const byName: Record<string, any> = {}
    for (const f of fields) { byName[(f as any).key$] = f }

    assert.deepStrictEqual(byName.id.type,'string')
    assert.deepStrictEqual(byName.created.type,'boolean')
  })


  test('inferFieldsFromExamples - Swagger 2.0 examples with media type', () => {
    const opdef = {
      responses: {
        200: {
          examples: {
            'application/json': {
              status: 'ok',
              version: 2,
            }
          }
        }
      }
    }

    const fields = inferFieldsFromExamples(opdef)
    assert.deepStrictEqual(fields.length,2)

    const byName: Record<string, any> = {}
    for (const f of fields) { byName[(f as any).key$] = f }

    assert.deepStrictEqual(byName.status.type,'string')
    assert.deepStrictEqual(byName.version.type,'integer')
  })

})
