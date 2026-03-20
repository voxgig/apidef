/* Copyright (c) 2024-2025 Voxgig Ltd, MIT License */

import { test, describe } from 'node:test'
import { expect } from '@hapi/code'

import {
  inferFieldsFromExamples,
  inferTypeFromValue,
} from '../../dist/transform/field'


describe('transform-field', () => {

  test('inferTypeFromValue', () => {
    expect(inferTypeFromValue('hello')).equal('string')
    expect(inferTypeFromValue('')).equal('string')
    expect(inferTypeFromValue(true)).equal('boolean')
    expect(inferTypeFromValue(false)).equal('boolean')
    expect(inferTypeFromValue(42)).equal('integer')
    expect(inferTypeFromValue(0)).equal('integer')
    expect(inferTypeFromValue(-1)).equal('integer')
    expect(inferTypeFromValue(3.14)).equal('number')
    expect(inferTypeFromValue(0.5)).equal('number')
    expect(inferTypeFromValue([1, 2])).equal('array')
    expect(inferTypeFromValue([])).equal('array')
    expect(inferTypeFromValue({ a: 1 })).equal('object')
    expect(inferTypeFromValue({})).equal('object')
    expect(inferTypeFromValue(null)).equal('string')
    expect(inferTypeFromValue(undefined)).equal('string')
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
    expect(fields.length).equal(7)

    const byName: Record<string, any> = {}
    for (const f of fields) { byName[(f as any).key$] = f }

    expect(byName.id.type).equal('string')
    expect(byName.name.type).equal('string')
    expect(byName.count.type).equal('integer')
    expect(byName.price.type).equal('number')
    expect(byName.active.type).equal('boolean')
    expect(byName.tags.type).equal('array')
    expect(byName.meta.type).equal('object')
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
    expect(fields.length).equal(3)

    const byName: Record<string, any> = {}
    for (const f of fields) { byName[(f as any).key$] = f }

    expect(byName.id.type).equal('string')
    expect(byName.title.type).equal('string')
    expect(byName.score.type).equal('number')
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
    expect(fields.length).equal(4)

    const byName: Record<string, any> = {}
    for (const f of fields) { byName[(f as any).key$] = f }

    expect(byName.username.type).equal('string')
    expect(byName.email.type).equal('string')
    expect(byName.is_active.type).equal('boolean')
    expect(byName.login_count.type).equal('integer')
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
    expect(fields.length).equal(2)

    const byName: Record<string, any> = {}
    for (const f of fields) { byName[(f as any).key$] = f }

    expect(byName.id.type).equal('integer')
    expect(byName.name.type).equal('string')
  })


  test('inferFieldsFromExamples - no responses returns empty', () => {
    expect(inferFieldsFromExamples({})).equal([])
    expect(inferFieldsFromExamples({ responses: {} })).equal([])
    expect(inferFieldsFromExamples({ responses: { 404: {} } })).equal([])
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
    expect(fields.length).equal(2)

    const byName: Record<string, any> = {}
    for (const f of fields) { byName[(f as any).key$] = f }

    expect(byName.id.type).equal('string')
    expect(byName.created.type).equal('boolean')
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
    expect(fields.length).equal(2)

    const byName: Record<string, any> = {}
    for (const f of fields) { byName[(f as any).key$] = f }

    expect(byName.status.type).equal('string')
    expect(byName.version.type).equal('integer')
  })

})
