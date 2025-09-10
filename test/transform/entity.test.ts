/* Copyright (c) 2024-2025 Voxgig Ltd, MIT License */


import { test, describe } from 'node:test'
import { expect } from '@hapi/code'



import {
  resolvePathList,
  buildRelations,
} from '../../dist/transform/entity'


describe('transform-entity', () => {

  // test('resolvePathList', () => {
  //   expect(resolvePathList).exist()

  //   expect(resolvePathList({
  //     path: {
  //       '/foo': {},
  //       '/bar/{bar}': {},
  //       '/zed/{f0}/dez/{f1}': {
  //         rename: {
  //           param: {
  //             f0: 't0',
  //             f1: 't1',
  //           }
  //         }
  //       },
  //     }
  //   })).equals([
  //     { orig: '/foo', parts: ['foo'], rename: {} },
  //     { orig: '/bar/{bar}', parts: ['bar', '{bar}'], rename: {} },
  //     {
  //       orig: '/zed/{f0}/dez/{f1}',
  //       parts: ['zed', '{t0}', 'dez', '{t1}'],
  //       rename: {
  //         param: {
  //           f0: 't0',
  //           f1: 't1',
  //         }
  //       }
  //     }
  //   ])
  // })


  test('buildRelations', () => {
    expect(buildRelations).exist()

    const r0 = buildRelations({}, [
      { parts: ['a'] },
      { parts: ['b', '{id}'] },
      { parts: ['d', 'c', '{id}'] },
      { parts: ['f', '{f_id}', 'e', '{id}'] },
      { parts: ['i', 'h', '{h_id}', 'g', '{id}'] },
      { parts: ['ii', 'h', '{h_id}', 'g', '{id}'] },
      { parts: ['l', '{l_id}', 'k', '{k_id}', 'j', '{id}'] },
      { parts: ['p', '{p_id}', 'n', '{n_id}', 'm', '{id}'] },
      { parts: ['q', '{q_id}', 'o', '{o_id}', 'n', '{n_id}', 'm', '{id}'] },
      { parts: ['oo', 'o', '{o_id}', 'n', '{n_id}', 'm', '{id}'] },
    ] as any)

    // console.dir(r0, { depth: null })
    expect(r0).equals({
      ancestors: [['f'], ['h'], ['l', 'k'], ['p', 'n'], ['q', 'o', 'n']]
    })
  })


})

