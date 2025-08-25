/* Copyright (c) 2024 Voxgig Ltd, MIT License */

import * as Fs from 'node:fs'

import { test, describe } from 'node:test'
import { expect } from '@hapi/code'

import { Aontu } from 'aontu'

import * as Diff from 'diff'


import {
  pathMatch
} from '../dist/utility'


// TODO: remove all sdk refs or rename to api


describe('utilit', () => {

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

})
