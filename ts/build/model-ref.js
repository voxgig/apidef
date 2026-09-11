#!/usr/bin/env node
/* Copyright (c) 2024-2026 Voxgig Ltd, MIT License */

// REFRESH ts/test/model-ref/ FROM THE CANONICAL TYPESCRIPT IMPLEMENTATION.
//
//   node ts/build/model-ref.js            # write ts/test/model-ref/
//   node ts/build/model-ref.js <dir>      # write somewhere else, to diff
//
// go/validate_test.go compares its own output against those files. It used to
// CREATE them from Go output on first run, which made a Go-vs-Go snapshot —
// useful as a regression guard, not a parity check, and its home under
// `ts/test/` said otherwise. Generating them here makes the comparison what
// it always claimed to be, and the two ports now agree byte for byte on all
// ten entities of all three specs.
//
// The shape must match validate_test.go exactly: each entity of
// `apimodel.main.kit.entity`, with `active` stripped (a Go-only key) and
// every object's keys sorted, as 2-space JSON.
//
// Reads the specs from an ../../apidef-validate checkout, the same external
// corpus the Go test reads, and skips with a message when it is absent.
const Fs = require('node:fs')
const Path = require('node:path')
const Os = require('node:os')

const TSROOT = Path.join(__dirname, '..')
const { ApiDef } = require(Path.join(TSROOT, 'dist', 'apidef'))

const VALIDATE = process.env.APIDEF_VALIDATE_DIR ||
  Path.join(TSROOT, '..', '..', 'apidef-validate', 'v1')

const OUT = process.argv[2] || Path.join(TSROOT, 'test', 'model-ref')

const CASES = [
  ['solar', '1.0.0', 'openapi-3.0.0', 'yaml'],
  ['petstore', '1.0.7', 'swagger-2.0', 'json'],
  ['taxonomy', '1.0.0', 'openapi-3.1.0', 'yaml'],
]

const strip = (n, key) => Array.isArray(n) ? n.map((x) => strip(x, key)) :
  (null != n && 'object' === typeof n) ?
    Object.fromEntries(Object.keys(n).filter((k) => k !== key)
      .map((k) => [k, strip(n[k], key)])) : n

const sortk = (n) => Array.isArray(n) ? n.map(sortk) :
  (null != n && 'object' === typeof n) ?
    Object.fromEntries(Object.keys(n).sort().map((k) => [k, sortk(n[k])])) : n

async function main() {
  if (!Fs.existsSync(VALIDATE)) {
    console.log('apidef-validate not found at ' + VALIDATE +
      ' — nothing to refresh. Set APIDEF_VALIDATE_DIR to point at it.')
    return
  }

  Fs.mkdirSync(OUT, { recursive: true })

  for (const [name, ver, spec, fmt] of CASES) {
    const cn = `${name}-${ver}-${spec}`
    const folder = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'apidefref-'))

    // The TS pipeline unifies a guide OVERLAY through aontu and needs the
    // entry file present; an empty overlay is the no-customization case,
    // which is what the Go run does (it has no aontu at all).
    Fs.mkdirSync(Path.join(folder, 'guide'), { recursive: true })
    // The overlay IMPORTS the schema and the generated base guide, exactly
    // as apidef-validate's harness writes it. `guide:{}` alone unifies to a
    // guide with no `entity` map, and the transformers then fail on it.
    Fs.writeFileSync(Path.join(folder, 'guide', cn + '-guide.aon'),
      '\n@"' + Path.join(TSROOT, 'model', 'guide.aon') + '"\n\n' +
      '@"' + cn + '-base-guide.aon"\n\nguide:{}\n')

    const build = await ApiDef.makeBuild({ folder, outprefix: cn + '-' })

    const bres = await build(
      { name, def: cn + '.' + fmt },
      { spec: { base: VALIDATE, buildargs: { apidef: { ctrl: { step: {
        parse: true, guide: true, transformers: true,
        builders: false, generate: false,
      } } } } } },
      {})

    const entities = bres?.apimodel?.main?.kit?.entity
    if (null == entities || 0 === Object.keys(entities).length) {
      throw new Error(cn + ': no entities (ok=' + (bres && bres.ok) +
        ' err=' + (bres && bres.err) + ')')
    }

    for (const entName of Object.keys(entities).sort()) {
      Fs.writeFileSync(
        Path.join(OUT, `${cn}-${entName}.json`),
        JSON.stringify(sortk(strip(entities[entName], 'active')), null, 2))
    }
    console.log(cn, Object.keys(entities).length, 'entities')
  }
}
main().catch((e) => { console.error('FAIL', e.message); process.exit(1) })
