/* Copyright (c) 2024-2025 Voxgig Ltd, MIT License */


import { test, describe } from 'node:test'
import { expect } from '@hapi/code'

import {
  pathMatch,
  formatJSONIC,
  depluralize,
  getModelPath,
} from '../dist/utility'




describe('utility', () => {

  test('depluralize', () => {
    expect(depluralize('Dogs')).equal('Dog')
    expect(depluralize('countries')).equal('country')
    expect(depluralize('good_dogs')).equal('good_dog')
    expect(depluralize('many_countries')).equal('many_country')
    expect(depluralize('mice')).equal('mouse')
    expect(depluralize('many_mice')).equal('many_mouse')

    expect(depluralize('api_key')).equal('api_key')
    expect(depluralize('api_keys')).equal('api_key')
    expect(depluralize('ApiKeys')).equal('ApiKey')
    expect(depluralize('API_Keys')).equal('API_Key')
  })

  test('pathMatch', async () => {
    const pmf = (p: any, x: any) => {
      const r = pathMatch(p, x)
      return null === r ? r : { i: r.index, m: r.slice(0), x: r.expr }
    }

    expect(pmf('/api/foo0', '/t/t/')).equals({
      i: 0, m: ['api', 'foo0'], x: '/t/t/'
    })

    expect(pmf('/api/foo0n', '/t/')).equals(null)
    expect(pmf('/api/foo0n', '/t/t/t/')).equals(null)
    expect(pmf('/api/foo0n', 'p/')).equals(null)
    expect(pmf('/api/foo0n', 't/p/')).equals(null)
    expect(pmf('/api/foo0n', '/t/p/')).equals(null)


    expect(pmf('/api/foo1/', '/t/t/')).equals({
      m: ['api', 'foo1'], i: 0, x: '/t/t/'
    })

    expect(pmf('api/foo2/', '/t/t/')).equals({
      m: ['api', 'foo2'], i: 0, x: '/t/t/'
    })

    expect(pmf('api/foo3', '/t/t/')).equals({
      m: ['api', 'foo3'], i: 0, x: '/t/t/'
    })


    expect(pmf('/foo4', '/t/')).equals({
      m: ['foo4'], i: 0, x: '/t/'
    })

    expect(pmf('/foo5/', '/t/')).equals({
      m: ['foo5'], i: 0, x: '/t/'
    })

    expect(pmf('foo6/', '/t/')).equals({
      m: ['foo6'], i: 0, x: '/t/'
    })

    expect(pmf('foo7', '/t/')).equals({
      m: ['foo7'], i: 0, x: '/t/'
    })


    expect(pmf('a0/{p0}', '/t/p/')).equals({
      m: ['a0', '{p0}'], i: 0, x: '/t/p/'
    })

    expect(pmf('{p1}/a1/', '/p/t/')).equals({
      m: ['{p1}', 'a1'], i: 0, x: '/p/t/'
    })


    expect(pmf('/a/b/c', '/t')).equals({
      m: ['a'], i: 0, x: '/t'
    })

    expect(pmf('/a/b/c', 't')).equals({
      m: ['a'], i: 0, x: 't'
    })


    expect(pmf('/a/b/c', 't/')).equals({
      m: ['c'], i: 2, x: 't/'
    })

    expect(pmf('/a/b/c', 't/t/')).equals({
      m: ['b', 'c'], i: 1, x: 't/t/'
    })


    expect(pmf('/a/b/{c}', 't/p/')).equals({
      m: ['b', '{c}'], i: 1, x: 't/p/'
    })

    expect(pmf('/a/b/{c}', 'p/')).equals({
      m: ['{c}'], i: 2, x: 'p/'
    })

    expect(pmf('/a/b/{c}', 't/')).equals(null)



    expect(pmf('/a/b/{c}/d', 't/p')).equals({
      m: ['b', '{c}'], i: 1, x: 't/p'
    })

    expect(pmf('/a/b/{c}/d', 'p/t')).equals({
      m: ['{c}', 'd'], i: 2, x: 'p/t'
    })

    expect(pmf('/a/b/{c}/d', 'p/t/')).equals({
      m: ['{c}', 'd'], i: 2, x: 'p/t/'
    })

    expect(pmf('/a/b/{c}/d/e', 'p/t/')).equals(null)
    expect(pmf('/a/b/{c}/d/e', 'p/t')).equals({
      i: 2, m: ['{c}', 'd'], x: 'p/t'
    })


    expect(pmf('/a/b/{c}/d/{e}', 't/p/')).equals({
      i: 3, m: ['d', '{e}'], x: 't/p/'
    })

    expect(pmf('/a/b/{c}/d/{e}', 't/p')).equals({
      i: 1, m: ['b', '{c}'], x: 't/p'
    })

    expect(pmf('/a/b/{c}/d/{e}', '/t/p')).equals(null)

    expect(pmf('/a/b/{c}/d/{e}', 't/p/t/p')).equals({
      i: 1, m: ['b', '{c}', 'd', '{e}'], x: 't/p/t/p'
    })
  })


  test('formatJSONIC', async () => {
    expect(formatJSONIC()).equal('')
    expect(formatJSONIC(undefined)).equal('')
    expect(formatJSONIC(null)).equal('null\n')
    expect(formatJSONIC(true)).equal('true\n')
    expect(formatJSONIC(11)).equal('11\n')
    expect(formatJSONIC("s")).equal('"s"\n')

    expect(formatJSONIC({
      "a": 1,
      "a_COMMENT": "note about a",
      "0b_COMMENT": "0b notes",
      "0b": {
        "$": "not printed",
        "_CUR": "dollar",
        "_CUR_COMMENT": [
          "x",
          "y"
        ]
      }
    })).equal(`{
  a: 1  # note about a
  "0b": {  # 0b notes
    _CUR: "dollar"  # x; y
  }

}
`)

    const a0: any = [100, 101, 102]
    a0['0_COMMENT'] = 'zero'
    a0['2_COMMENT'] = 'two'

    expect(formatJSONIC({ a: a0, a_COMMENT: 'array' })).equal(`{
  a: [  # array
    100  # zero
    101
    102  # two
  ]

}
`)


    expect(formatJSONIC({ _COMMENT: 'topO' })).equal(`{  # topO
}
`)

    const a1: any = []
    a1._COMMENT = 'topA'
    expect(formatJSONIC(a1)).equal(`[  # topA
]
`)


    expect(formatJSONIC({ a: { b: {}, c: [], d: {} }, e: {} })).equal(`{
  a: {
    b: {
    }
    c: [
    ]
    d: {
    }
  }

  e: {
  }

}
`)


    expect(formatJSONIC({ a1: { b1: {}, c1: [], d1: {} }, e1: {} }, { hsepd: 2 })).equal(`{
  a1: {
    b1: {
    }

    c1: [
    ]

    d1: {
    }

  }

  e1: {
  }

}
`)


  })


  test('getModelPath - basic path traversal', () => {
    const model = {
      a: {
        b: {
          c: 'value'
        }
      }
    }

    expect(getModelPath(model, 'a')).equal(model.a)
    expect(getModelPath(model, 'a.b')).equal(model.a.b)
    expect(getModelPath(model, 'a.b.c')).equal('value')
  })


  test('getModelPath - array indexing', () => {
    const model = {
      items: [
        { name: 'first', value: 1 },
        { name: 'second', value: 2 },
        { name: 'third', value: 3 }
      ]
    }

    expect(getModelPath(model, 'items.0')).equal(model.items[0])
    expect(getModelPath(model, 'items.1')).equal(model.items[1])
    expect(getModelPath(model, 'items.2')).equal(model.items[2])
    expect(getModelPath(model, 'items.0.name')).equal('first')
    expect(getModelPath(model, 'items.1.value')).equal(2)
    expect(getModelPath(model, 'items.2.name')).equal('third')
  })


  test('getModelPath - nested arrays and objects', () => {
    const model = {
      data: {
        nested: [
          {
            items: [
              { id: 'a' },
              { id: 'b' }
            ]
          }
        ]
      }
    }

    expect(getModelPath(model, 'data.nested.0.items.0.id')).equal('a')
    expect(getModelPath(model, 'data.nested.0.items.1.id')).equal('b')
  })


  test('getModelPath - required:true (default) throws on missing path', () => {
    const model = {
      a: {
        b: 'value'
      }
    }

    // Missing intermediate key
    try {
      getModelPath(model, 'a.x.c')
      expect(false).true() // Should not reach here
    } catch (err: any) {
      expect(err.message).contains("path not found at 'a.x.c'")
      expect(err.message).contains("Valid path up to: 'a'")
      expect(err.message).contains("Property 'x' does not exist")
      expect(err.message).contains("Available keys: [b]")
    }

    // Missing final key - should show available keys
    try {
      getModelPath(model, 'a.missing')
      expect(false).true() // Should not reach here
    } catch (err: any) {
      expect(err.message).contains("path not found at 'a.missing'")
      expect(err.message).contains("Valid path up to: 'a'")
      expect(err.message).contains("Property 'missing' does not exist")
      expect(err.message).contains("Available keys: [b]")
    }

    // Missing root key
    try {
      getModelPath(model, 'missing')
      expect(false).true() // Should not reach here
    } catch (err: any) {
      expect(err.message).contains("path not found at 'missing'")
      expect(err.message).contains("Valid path up to: '(root)'")
      expect(err.message).contains("Property 'missing' does not exist")
      expect(err.message).contains("Available keys: [a]")
    }
  })


  test('getModelPath - required:true throws on null/undefined in path', () => {
    const model = {
      a: {
        b: null
      }
    }

    try {
      getModelPath(model, 'a.b.c')
      expect(false).true() // Should not reach here
    } catch (err: any) {
      expect(err.message).contains("path not found at 'a.b.c'")
      expect(err.message).contains("Valid path up to: 'a.b'")
      expect(err.message).contains("Cannot access property 'c' of null")
    }

    const model2 = {
      a: {
        b: undefined
      }
    }

    try {
      getModelPath(model2, 'a.b.c')
      expect(false).true() // Should not reach here
    } catch (err: any) {
      expect(err.message).contains("path not found at 'a.b.c'")
      expect(err.message).contains("Valid path up to: 'a.b'")
      expect(err.message).contains("Cannot access property 'c' of undefined")
    }
  })


  test('getModelPath - required:true throws on array index out of bounds', () => {
    const model = {
      items: [
        { name: 'first' },
        { name: 'second' }
      ]
    }

    try {
      getModelPath(model, 'items.5')
      expect(false).true() // Should not reach here
    } catch (err: any) {
      expect(err.message).contains("path not found at 'items.5'")
      expect(err.message).contains("Valid path up to: 'items'")
      expect(err.message).contains("Property '5' does not exist")
      expect(err.message).contains("Available keys: array indices 0-1")
    }
  })


  test('getModelPath - required:false returns undefined on missing path', () => {
    const model = {
      a: {
        b: 'value'
      }
    }

    expect(getModelPath(model, 'a.x.c', { required: false })).equal(undefined)
    expect(getModelPath(model, 'a.missing', { required: false })).equal(undefined)
    expect(getModelPath(model, 'missing', { required: false })).equal(undefined)
    expect(getModelPath(model, 'a.b.c', { required: false })).equal(undefined)
  })


  test('getModelPath - required:false returns undefined on null/undefined in path', () => {
    const model = {
      a: {
        b: null
      }
    }

    expect(getModelPath(model, 'a.b.c', { required: false })).equal(undefined)

    const model2 = {
      a: {
        b: undefined
      }
    }

    expect(getModelPath(model2, 'a.b.c', { required: false })).equal(undefined)
  })


  test('getModelPath - required:false returns undefined for array out of bounds', () => {
    const model = {
      items: [{ name: 'first' }]
    }

    expect(getModelPath(model, 'items.5', { required: false })).equal(undefined)
    expect(getModelPath(model, 'items.5.name', { required: false })).equal(undefined)
  })


  test('getModelPath - empty path handling', () => {
    const model = { a: 'value' }

    try {
      getModelPath(model, '')
      expect(false).true() // Should not reach here
    } catch (err: any) {
      expect(err.message).contains('empty path provided')
    }

    expect(getModelPath(model, '', { required: false })).equal(undefined)
  })


  test('getModelPath - returns actual values including falsy ones', () => {
    const model = {
      zero: 0,
      empty: '',
      falsy: false,
      nullValue: null
    }

    expect(getModelPath(model, 'zero')).equal(0)
    expect(getModelPath(model, 'empty')).equal('')
    expect(getModelPath(model, 'falsy')).equal(false)
    expect(getModelPath(model, 'nullValue')).equal(null)
  })
})

