/* Copyright (c) 2024-2025 Voxgig Ltd, MIT License */


import { test, describe } from 'node:test'
import assert from 'node:assert'



import {
  resolvePathList,
  buildRelations,
} from '../../dist/transform/entity'


describe('transform-entity', () => {

  // resolvePathList is THE path construction site (ADR-003): the split, the
  // rename application and the segment typing happen there and nowhere else.
  test('resolvePathList: paths become typed segments', () => {
    assert.ok(resolvePathList)

    const paths = resolvePathList({
      path: {
        '/foo': {},
        '/bar/{bar}': {},
        '/zed/{f0}/dez/{f1}': { rename: { param: { f0: 't0', f1: 't1' } } },
      }
    } as any, { paths: {} } as any)

    // each() iterates in SORTED key order, so the result is bar, foo, zed —
    // not declaration order.
    assert.deepStrictEqual(paths.map((p: any) => p.segments), [
      [{ lit: 'bar' }, { var: 'bar' }],
      [{ lit: 'foo' }],
      // Renames apply to the NAME, not by rewriting a braced string.
      [{ lit: 'zed' }, { var: 't0' }, { lit: 'dez' }, { var: 't1' }],
    ])

    // No braced strings survive: a consumer never parses a segment.
    for (const p of paths) {
      for (const s of p.segments) {
        assert.ok(null == s.lit || !s.lit.startsWith('{'),
          'a literal segment must not be a braced string: ' + JSON.stringify(s))
      }
    }
  })


  test('resolvePathList: renames do not chain', () => {
    const paths = resolvePathList({
      path: {
        '/groups/{id}/badges/{badge_id}': {
          rename: { param: { badge_id: 'id', id: 'project_id' } }
        },
      }
    } as any, { paths: {} } as any)

    assert.deepStrictEqual(paths[0].segments, [
      { lit: 'groups' }, { var: 'project_id' },
      { lit: 'badges' }, { var: 'id' },
    ])
  })


  test('resolvePathList: a repeated placeholder renames consistently', () => {
    const paths = resolvePathList({
      path: { '/a/{id}/b/{id}': { rename: { param: { id: 'thing_id' } } } }
    } as any, { paths: {} } as any)

    assert.deepStrictEqual(paths[0].segments, [
      { lit: 'a' }, { var: 'thing_id' },
      { lit: 'b' }, { var: 'thing_id' },
    ])
  })


  test('resolvePathList: a compound element is a literal, not a bogus var', () => {
    const paths = resolvePathList({
      path: {
        '/x/{a}.{b}': { rename: { param: { a: 'aa', b: 'bb' } } },
        '/y/{}': {},
        '/z/pre{c}': {},
      }
    } as any, { paths: {} } as any)

    assert.deepStrictEqual(paths.map((p: any) => p.segments), [
      [{ lit: 'x' }, { lit: '{a}.{b}' }],
      [{ lit: 'y' }, { lit: '{}' }],
      [{ lit: 'z' }, { lit: 'pre{c}' }],
    ])
  })


  test('resolvePathList: a partial-element placeholder stays literal (ADR-003 limit)', () => {
    const paths = resolvePathList({
      path: {
        '/reports/{id}.json': { rename: { param: { id: 'report_id' } } },
        '/v{version}/items': {},
      }
    } as any, { paths: {} } as any)

    assert.deepStrictEqual(paths.map((p: any) => p.segments), [
      [{ lit: 'reports' }, { lit: '{id}.json' }],
      [{ lit: 'v{version}' }, { lit: 'items' }],
    ])

    const parts = (p: any) => p.segments.map((s: any) =>
      null == s.var ? String(s.lit ?? '') : '{' + s.var + '}')
    assert.deepStrictEqual(paths.map(parts), [
      ['reports', '{id}.json'],
      ['v{version}', 'items'],
    ])
  })


  test('buildRelations', () => {
    assert.ok(buildRelations)

    const r0 = buildRelations({}, [
      { segments: [{ lit: 'a' }] },
      { segments: [{ lit: 'b' }, { var: 'id' }] },
      { segments: [{ lit: 'd' }, { lit: 'c' }, { var: 'id' }] },
      { segments: [{ lit: 'f' }, { var: 'f_id' }, { lit: 'e' }, { var: 'id' }] },
      { segments: [{ lit: 'i' }, { lit: 'h' }, { var: 'h_id' }, { lit: 'g' }, { var: 'id' }] },
      { segments: [{ lit: 'ii' }, { lit: 'h' }, { var: 'h_id' }, { lit: 'g' }, { var: 'id' }] },
      { segments: [{ lit: 'l' }, { var: 'l_id' }, { lit: 'k' }, { var: 'k_id' }, { lit: 'j' }, { var: 'id' }] },
      { segments: [{ lit: 'p' }, { var: 'p_id' }, { lit: 'n' }, { var: 'n_id' }, { lit: 'm' }, { var: 'id' }] },
      { segments: [{ lit: 'q' }, { var: 'q_id' }, { lit: 'o' }, { var: 'o_id' }, { lit: 'n' }, { var: 'n_id' }, { lit: 'm' }, { var: 'id' }] },
      { segments: [{ lit: 'oo' }, { lit: 'o' }, { var: 'o_id' }, { lit: 'n' }, { var: 'n_id' }, { lit: 'm' }, { var: 'id' }] },
    ] as any)

    assert.deepStrictEqual(r0, {
      ancestors: [['f'], ['h'], ['l', 'k'], ['p', 'n'], ['q', 'o', 'n']]
    })
  })


})

