#!/usr/bin/env node
/* Copyright (c) 2026 Voxgig Ltd, MIT License */

// THE AUTHORED WEIGHTS OF THE GUIDE NETWORKS, AND THE TOOL THAT WRITES THEM.
//
//   node ts/build/nn-weights.js            # write nn/guide.safetensors
//   node ts/build/nn-weights.js --check    # exit 1 when the file differs
//
// The strategy (ts/src/guide/neural01.ts) reads nn/guide.safetensors through
// its ts/nn/ mirror and never these tables, so a trained set of weights can
// replace the file without touching the pipeline. `make nn` runs this and
// syncs the mirrors; `make check-nn` runs the check. See
// docs/design/neural-guide.md for the gate scheme the tables follow.
const Fs = require('node:fs')
const Path = require('node:path')

const { makeNet, saveNets } = require(Path.join(__dirname, '..', 'dist', 'guide', 'nn'))

const WEIGHTS = Path.join(__dirname, '..', '..', 'nn', 'guide.safetensors')


// Rectified units are gates: a conjunction of k inputs has unit weights and
// bias 1-k, a negated input weight -1, so each fires at exactly 1.

const PROBABLE_NET = makeNet(
  ['nores', 'has_body', 'm_post', 'm_put', 'm_patch', 'm_query', 'm_get',
    'ends_p_slash', 'lit_in_other_paths'],
  {
    nores: { b: 0, w: { nores: 1 } },
    post_body: { b: -2, w: { has_body: 1, m_post: 1, ends_p_slash: -1, lit_in_other_paths: 1 } },
    putish: { b: -2, w: { has_body: 1, m_put: 1, m_patch: 1, ends_p_slash: 1 } },
    query_body: { b: -1, w: { has_body: 1, m_query: 1 } },
    get_nobody: { b: 0, w: { m_get: 1, has_body: -1 } },
  },
  {
    YES: { b: 0, w: { nores: 3, post_body: 3, putish: 3, query_body: 3, get_nobody: 3 } },
    NO: { b: 1, w: {} },
  },
)

const CMP_KEEP_NET = makeNet(
  ['single', 'in_path', 'occurs', 'infrequent'],
  {
    keep: { b: 0, w: { single: 1, in_path: 1, occurs: 1, infrequent: 1 } },
  },
  {
    KEEP: { b: 0, w: { keep: 3 } },
    DROP: { b: 1, w: {} },
  },
)

const CMP_SOURCE_NET = makeNet(
  ['cmp_avail', 'tag_avail', 'tag_is_cmp', 'tag_in_path', 'tag_eq_cmp'],
  {
    cmp: { b: 0, w: { cmp_avail: 1 } },
    tag_only: { b: 0, w: { tag_avail: 1, cmp_avail: -1 } },
    tag_over: { b: -3, w: { cmp_avail: 1, tag_avail: 1, tag_is_cmp: 1, tag_in_path: 1, tag_eq_cmp: -1 } },
  },
  {
    CMP: { b: 0, w: { cmp: 2, tag_over: -3 } },
    TAG: { b: 0, w: { tag_only: 2, tag_over: 3 } },
    NONE: { b: 1, w: {} },
  },
)

const OP_NET = makeNet(
  ['m_get', 'm_query', 'm_post', 'm_put', 'm_patch', 'm_delete', 'm_head', 'm_options',
    'end_param_anchored', 'end_param_bare', 'res_array', 'res_array_prop'],
  {
    read: { b: 0, w: { m_get: 1, m_query: 1 } },
    list_array: { b: -1, w: { m_get: 1, m_query: 1, end_param_anchored: -1, res_array: 1 } },
    list_prop: {
      b: -1,
      w: { m_get: 1, m_query: 1, end_param_anchored: -1, end_param_bare: -1, res_array_prop: 1 },
    },
    post: { b: 0, w: { m_post: 1 } },
    put: { b: 0, w: { m_put: 1 } },
    patch: { b: 0, w: { m_patch: 1 } },
    delete: { b: 0, w: { m_delete: 1 } },
    head: { b: 0, w: { m_head: 1 } },
    options: { b: 0, w: { m_options: 1 } },
  },
  {
    list: { b: 0, w: { list_array: 5, list_prop: 5 } },
    load: { b: 0, w: { read: 3 } },
    create: { b: 0, w: { post: 5 } },
    update: { b: 0, w: { put: 5 } },
    patch: { b: 0, w: { patch: 5 } },
    remove: { b: 0, w: { delete: 5 } },
    head: { b: 0, w: { head: 5 } },
    OPTIONS: { b: 0, w: { options: 5 } },
  },
)

const NAME_NET = makeNet(
  ['shaped', 'shape_tpt', 'cmp_avail', 'cmp_from_tag', 'cmp_ne_path', 'cmp_qualifies',
    'cmp_infrequent', 'cmp_shared', 'cmp_in_path', 'probable', 'm_delete', 'm_write',
    'delcmp_avail', 'cmp_occur_le1', 'last_lit_singular', 'cmp_not_verb',
    'item_route_exists', 'route_not_extended', 'last_is_cmp', 'path_has_children',
    'same_path_avail', 'opid_avail', 'title_avail', 'seg_avail',
    'tag_item_route', 'tag_cmp_is_record', 'collrec_avail', 'tag_collides'],
  {
    shaped: { b: 0, w: { shaped: 1 } },
    coll_record: {
      b: -3, w: { cmp_from_tag: 1, tag_item_route: 1, tag_cmp_is_record: 1, collrec_avail: 1 },
    },
    coll_segment: {
      b: -2, w: { cmp_from_tag: 1, tag_item_route: 1, tag_cmp_is_record: -1, tag_collides: 1 },
    },
    same_path: { b: -1, w: { cmp_from_tag: 1, same_path_avail: 1 } },
    vop: {
      b: -7,
      w: {
        shape_tpt: 1, cmp_avail: 1, m_write: 1, cmp_occur_le1: 1, last_lit_singular: 1,
        cmp_not_verb: 1, item_route_exists: 1, route_not_extended: 1,
      },
    },
    cmp_qualifies: { b: -3, w: { shaped: 1, cmp_avail: 1, cmp_ne_path: 1, cmp_qualifies: 1 } },
    cmp_primary: {
      b: -3,
      w: {
        shaped: 1, cmp_avail: 1, cmp_ne_path: 1, cmp_infrequent: 1, cmp_shared: -1, cmp_qualifies: -1,
      },
    },
    cmp_in_path: {
      b: -3, w: { shaped: 1, cmp_avail: 1, cmp_ne_path: 1, cmp_in_path: 1, cmp_qualifies: -1 },
    },
    delete_cmp: { b: -3, w: { shaped: 1, m_delete: 1, cmp_avail: -1, delcmp_avail: 1, probable: 1 } },
    tpt_last_cmp: {
      b: -2, w: { shape_tpt: 1, cmp_avail: -1, probable: 1, last_is_cmp: 1, delcmp_avail: -1 },
    },
    tpt_last_child: {
      b: -2, w: { shape_tpt: 1, cmp_avail: -1, probable: 1, path_has_children: 1, delcmp_avail: -1 },
    },
    tpt_part: { b: -1, w: { shape_tpt: 1, cmp_avail: -1, probable: 1, delcmp_avail: -1 } },
    tpt_act: { b: 0, w: { shape_tpt: 1, cmp_avail: -1, probable: -1 } },
    none_opid: { b: 0, w: { shaped: -1, opid_avail: 1 } },
    none_title: { b: 0, w: { shaped: -1, title_avail: 1 } },
    none_seg: { b: 0, w: { shaped: -1, seg_avail: 1 } },
  },
  {
    COLLREC: { b: 0, w: { coll_record: 30 } },
    COLLSEG: { b: 0, w: { coll_segment: 30 } },
    SAMEPATH: { b: 0, w: { same_path: 20 } },
    PARENT: { b: 0, w: { vop: 10 } },
    CMPQ: { b: 0, w: { cmp_qualifies: 6 } },
    CMP: { b: 0, w: { cmp_primary: 5, cmp_in_path: 4 } },
    DELCMP: { b: 0, w: { delete_cmp: 5 } },
    LAST: { b: 0, w: { tpt_last_cmp: 4, tpt_last_child: 4 } },
    PART: { b: 0, w: { tpt_part: 3 } },
    ACT: { b: 0, w: { tpt_act: 4 } },
    PATH: { b: 0, w: { shaped: 1.5 } },
    OPID: { b: 0, w: { none_opid: 6 } },
    TITLE: { b: 0, w: { none_title: 5 } },
    SEG: { b: 0, w: { none_seg: 4 } },
    NONE: { b: 0.5, w: {} },
  },
)

const ACTION_NET = makeNet(
  ['same_path', 'vop_chosen', 'last_verb', 'l2_is_ent', 'l3_is_ent', 'l4_is_ent',
    'l2_param', 'l3_param', 'l2_verb', 'ent_endswith_last', 'ent_endswith_compound'],
  {
    act_vop: { b: -1, w: { vop_chosen: 1, last_verb: 1, same_path: -1 } },
    act_l2: {
      b: -1,
      w: { l2_is_ent: 1, last_verb: 1, vop_chosen: -1, same_path: -1, ent_endswith_last: -1 },
    },
    act_l3: {
      b: -2,
      w: {
        l3_is_ent: 1, l2_param: 1, last_verb: 1, vop_chosen: -1, l2_is_ent: -1, same_path: -1,
        ent_endswith_last: -1,
      },
    },
    act_l4: {
      b: -3,
      w: {
        l4_is_ent: 1, l3_param: 1, l2_verb: 1, last_verb: 1, vop_chosen: -1, l2_is_ent: -1,
        l3_is_ent: -1, same_path: -1, ent_endswith_compound: -1,
      },
    },
  },
  {
    NONE: { b: 1, w: {} },
    LAST: { b: 0, w: { act_vop: 5, act_l2: 4, act_l3: 4 } },
    COMPOUND: { b: 0, w: { act_l4: 4 } },
  },
)

const PARAM_NET = makeNet(
  ['pp_shape', 'last', 'second_last', 'not_last', 'has_parent', 'idx_gt1', 'exact_id',
    'idlike', 'parent_eq_ent', 'ent_starts_parent', 'ent_ends_parent', 'name_param',
    'canon_eq_ent', 'snake_differs', 'parent_id_differs'],
  {
    b1_action: {
      b: -4,
      w: {
        idlike: 1, has_parent: 1, not_last: 1, second_last: 1, parent_eq_ent: -1,
        ent_starts_parent: 1,
      },
    },
    b1_parent_ent: { b: -3, w: { idlike: 1, has_parent: 1, not_last: 1, parent_eq_ent: 1 } },
    b1_parent_id: { b: -2, w: { idlike: 1, has_parent: 1, not_last: 1, name_param: -1 } },
    b2_noparent: { b: 0, w: { last: 1, exact_id: -1, has_parent: -1 } },
    b2_parent_ent: { b: -1, w: { last: 1, exact_id: -1, parent_eq_ent: 1 } },
    b2_ends_parent: { b: -1, w: { last: 1, exact_id: -1, ent_ends_parent: 1 } },
    b3_end_action: {
      b: -4,
      w: {
        not_last: 1, idx_gt1: 1, has_parent: 1, idlike: -1, second_last: 1, exact_id: -1,
        canon_eq_ent: 1,
      },
    },
    b3_not_primary: {
      b: -3,
      w: {
        not_last: 1, idx_gt1: 1, has_parent: 1, idlike: -1, second_last: -1,
        parent_id_differs: 1, name_param: -1,
      },
    },
    snake: { b: 0, w: { snake_differs: 1 } },
    pp: { b: 0, w: { pp_shape: 1 } },
  },
  {
    ID: {
      b: 0,
      w: {
        b1_action: 6, b1_parent_ent: 6, b2_noparent: 5, b2_parent_ent: 5, b2_ends_parent: 5,
        b3_end_action: 4, pp: -20,
      },
    },
    PARENT_ID: { b: 0, w: { b1_parent_id: 5, b3_not_primary: 4, pp: -20 } },
    SNAKE: { b: 0, w: { snake: 2 } },
    KEEP: { b: 1, w: {} },
  },
)

const NETS = {
  probable: PROBABLE_NET,
  cmpKeep: CMP_KEEP_NET,
  cmpSource: CMP_SOURCE_NET,
  op: OP_NET,
  name: NAME_NET,
  action: ACTION_NET,
  param: PARAM_NET,
}


function authoredNets() {
  return NETS
}


function buildGuideWeights() {
  return saveNets(NETS)
}


function main() {
  const rel = Path.relative(process.cwd(), WEIGHTS)
  const bytes = Buffer.from(buildGuideWeights())

  if (process.argv.includes('--check')) {
    const have = Fs.existsSync(WEIGHTS) ? Fs.readFileSync(WEIGHTS) : null
    if (null == have || 0 !== Buffer.compare(have, bytes)) {
      console.error('nn-weights: ' + rel + ' differs from the authored tables (run: make nn)')
      process.exit(1)
    }
    console.log('nn-weights: ' + rel + ' matches the authored tables')
    return
  }

  Fs.mkdirSync(Path.dirname(WEIGHTS), { recursive: true })
  Fs.writeFileSync(WEIGHTS, bytes)
  console.log('nn-weights: wrote ' + rel + ' (' + bytes.length + ' bytes, ' +
    Object.keys(NETS).length + ' networks)')
}


if (require.main === module) {
  main()
}

module.exports = { authoredNets, buildGuideWeights, WEIGHTS }
