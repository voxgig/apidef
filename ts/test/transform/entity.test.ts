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


  // CHAINED RENAMES. The braced-string form had to rewrite only the FIRST
  // match (an indexOf + break), because a second pass would re-read the name
  // it had just written: with { badge_id: 'id', id: 'project_id' },
  // /groups/{id}/badges/{badge_id} could end up with {project_id} in both
  // slots, silently dropping an argument from the URL.
  //
  // Segments cannot chain: each segment's ORIGINAL name is looked up once, so
  // {id} -> project_id and {badge_id} -> id, independently.
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


  // A repeated placeholder is ONE parameter and must rename consistently.
  // indexOf+break renamed only the first, leaving the second referring to a
  // parameter name that no longer existed.
  test('resolvePathList: a repeated placeholder renames consistently', () => {
    const paths = resolvePathList({
      path: { '/a/{id}/b/{id}': { rename: { param: { id: 'thing_id' } } } }
    } as any, { paths: {} } as any)

    assert.deepStrictEqual(paths[0].segments, [
      { lit: 'a' }, { var: 'thing_id' },
      { lit: 'b' }, { var: 'thing_id' },
    ])
  })


  // A COMPOUND element: two placeholders glued together with a separator
  // that belongs to neither, e.g. `/x/{outputFields}.{format}`. Typing it
  // `{ var }` would invent a parameter named `outputFields}.{format`, which
  // matches nothing in args.params. It is a literal — the same thing the
  // braced-string form did with it, since the rename lookup was a
  // whole-element match too.
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

    // console.dir(r0, { depth: null })
    assert.deepStrictEqual(r0, {
      ancestors: [['f'], ['h'], ['l', 'k'], ['p', 'n'], ['q', 'o', 'n']]
    })
  })


})

