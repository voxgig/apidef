
import Path from 'node:path'

import { snakify, camelify, kebabify, each } from 'jostraca'

import { decircular } from '@voxgig/util'

import {
  slice, merge, inject, clone, isnode, walk, transform, select, keysof,
  Injection,
  M_VAL,
  M_KEYPRE,
  M_KEYPOST,

} from '@voxgig/struct'


import type {
  FsUtil,
  Log,
  Warner,
} from './types'


const KONSOLE_LOG = console['log']

// Sorted iteration helpers — ensures deterministic key order matching Go.
const sortedKeys = (obj: any): string[] => Object.keys(obj ?? {}).sort()
const sortedEntries = (obj: any): [string, any][] =>
  Object.entries(obj ?? {}).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)

// Pre-compiled regex patterns for formatJsonSrc to avoid recompilation per call.
const RE_JSON_KEY = /"([a-zA-Z_][a-zA-Z_0-9]*)": /g
const RE_JSON_TRAILING_BRACE = /},/g
const RE_JSON_COMMENT = /\n(\s*)([a-zA-Z_][a-zA-Z_0-9]*)_COMMENT:\s*"(.*)",/g

const RE_BARE_KEY = /^[A-Za-z_][_A-Za-z0-9]*$/
const isBareKey = (k: string) => RE_BARE_KEY.test(k)
const quoteKey = (k: string) => (isBareKey(k) ? k : JSON.stringify(k))


function makeWarner(spec: { point: string, log: Log }): Warner {
  const { point, log } = spec
  const history: ({ point: string, when: number } & Record<string, any>)[] = []
  const warn = function warn(def: Record<string, any>) {
    const warning = { point, when: Date.now(), ...def }
    log.warn(warning)
    history.push(warning)
  }
  warn.history = history
  warn.point = point
  return warn
}


function writeFileSyncWarn(warn: Warner, fs: any, path: string, text: string) {
  try {
    fs.writeFileSync(path, text)
  }
  catch (err: any) {
    warn({
      err,
      note: 'Unable to save file: ' + relativizePath(path)
    })
  }
}



function getdlog(
  tagin?: string,
  filepath?: string)
  : ((...args: any[]) => void) &
  { tag: string, file: string, log: (fp?: string) => any[] } {
  const tag = tagin || '-'
  const file = Path.basename(filepath || '-')
  const g = global as any
  g.__dlog__ = (g.__dlog__ || [])
  const dlog = (...args: any[]) =>
    g.__dlog__.push([tag, file, Date.now(), ...args])
  dlog.tag = tag
  dlog.file = file
  dlog.log = (filepath?: string, f?: string | null) =>
  (f = null == filepath ? null : Path.basename(filepath),
    g.__dlog__.filter((n: any[]) => n[0] === tag && (null == f || n[2] === f)))
  return dlog
}

// Log non-fatal wierdness.
const dlog = getdlog('apidef', __filename)


function loadFile(path: string, what: string, fs: FsUtil, log: Log) {
  try {
    const source = fs.readFileSync(path, 'utf8')
    return source
  }
  catch (err: any) {
    log.error({ load: 'fail', what, path, err })
    throw err
  }
}


function formatJsonSrc(jsonsrc: string) {
  return jsonsrc
    .replace(RE_JSON_KEY, '$1: ')
    .replace(RE_JSON_TRAILING_BRACE, '}\n')
    .replace(RE_JSON_COMMENT, '\n\n$1# $2 $3')
}


const IRREGULARS: Record<string, string> = Object.assign(Object.create(null), {
  'analytics': 'analytics',
  'analyses': 'analysis',
  'appendices': 'appendix',
  'avalanches': 'avalanche',
  'axes': 'axis',
  'caches': 'cache',
  'canoes': 'canoe',
  'cases': 'case',
  'children': 'child',
  'cliches': 'cliche',
  'courses': 'course',
  'creches': 'creche',
  'crises': 'crisis',
  'criteria': 'criterion',
  // 'data': 'datum',
  'diagnoses': 'diagnosis',
  'doses': 'dose',
  'douches': 'douche',
  'feet': 'foot',
  'furnaces': 'furnace',
  'geese': 'goose',
  'headaches': 'headache',
  'horses': 'horse',
  'hoses': 'hose',
  'houses': 'house',
  'indices': 'index',
  'lens': 'lens',
  'licenses': 'license',
  'matrices': 'matrix',
  'men': 'man',
  'mice': 'mouse',
  'moustaches': 'moustache',
  'movies': 'movie',
  'mustaches': 'mustache',
  'niches': 'niche',
  'noses': 'nose',
  'notices': 'notice',
  'nurses': 'nurse',
  'oases': 'oasis',
  'oboes': 'oboe',
  'pastiches': 'pastiche',
  'pauses': 'pause',
  'phases': 'phase',
  'phrases': 'phrase',
  'practices': 'practice',
  'premises': 'premise',
  'promises': 'promise',
  'psyches': 'psyche',
  'purses': 'purse',
  'releases': 'release',
  'roses': 'rose',
  'people': 'person',
  'phenomena': 'phenomenon',
  'series': 'series',
  'shoes': 'shoe',
  'sources': 'source',
  'species': 'species',
  'teeth': 'tooth',
  'theses': 'thesis',
  'verses': 'verse',
  'vertices': 'vertex',
  'women': 'woman',
  'yes': 'yes',
})


// Sorted longest-first so the most specific IRREGULARS suffix wins.
// Without this, 'women' would be shadowed by 'men' (3 < 5) under
// insertion-order iteration. Both happen to round-trip correctly
// today, but the sort makes any future entry safe by construction.
const IRREGULAR_KEYS = Object.keys(IRREGULARS).sort((a, b) => b.length - a.length)


function matchCase(source: string, target: string): string {
  if (source === source.toLowerCase()) return target.toLowerCase()
  if (source === source.toUpperCase()) return target.toUpperCase()
  if (source[0] === source[0].toUpperCase()) {
    return target[0].toUpperCase() + target.slice(1).toLowerCase()
  }
  return target
}


let CUSTOM_PLURALS: Record<string, string> = Object.create(null)
let CUSTOM_PLURAL_KEYS: string[] = []


function setCustomPlurals(plurals: Record<string, string> | undefined | null) {
  CUSTOM_PLURALS = Object.create(null)
  if (plurals) {
    for (const k of Object.keys(plurals)) {
      // Skip null/undefined values so a partially-typed model entry
      // doesn't poison the map.
      const v = plurals[k]
      if (null == v) continue
      CUSTOM_PLURALS[k.toLowerCase()] = v
    }
  }
  CUSTOM_PLURAL_KEYS = Object.keys(CUSTOM_PLURALS).sort((a, b) => b.length - a.length)

  // canonize() memoizes depluralize() output, and depluralize() consults
  // CUSTOM_PLURALS — so the cache is only valid for the plural config that
  // produced it. ApiDef.makeBuild reuses one apidef instance across models,
  // so without this a second model would read the first model's
  // custom-plural-affected canonize results. Invalidate on every change.
  CANONIZE_CACHE.clear()
}


function clearCustomPlurals() {
  setCustomPlurals(undefined)
}

function depluralize(word: string): string {
  if (!word || word.length === 0) {
    return word
  }

  // Case-insensitive throughout: IRREGULARS lookups and every
  // suffix-rule endsWith() check operate on the lowercased form,
  // but slice/concat use the original word so the caller's casing
  // is preserved (HOUSES → HOUSE, Houses → House, houses → house).
  const lower = word.toLowerCase()

  // Per-model custom plurals win over the built-in IRREGULARS and
  // rule chain. Same lookup shape: exact match first, then
  // longest-suffix match against CUSTOM_PLURAL_KEYS.
  const customExact = CUSTOM_PLURALS[lower]
  if (customExact) {
    return matchCase(word, customExact)
  }
  for (const ending of CUSTOM_PLURAL_KEYS) {
    if (lower.endsWith(ending)) {
      const cut = word.length - ending.length
      return word.slice(0, cut) + matchCase(word.slice(cut), CUSTOM_PLURALS[ending])
    }
  }

  const exact = IRREGULARS[lower]
  if (exact) {
    return matchCase(word, exact)
  }

  for (const ending of IRREGULAR_KEYS) {
    if (lower.endsWith(ending)) {
      const cut = word.length - ending.length
      return word.slice(0, cut) + matchCase(word.slice(cut), IRREGULARS[ending])
    }
  }

  // Rules for regular plurals (applied in order). The -ies and -ves
  // rules add a letter, so they need to match the case of the dropped
  // suffix; all other rules just slice and inherit the caller's case.

  if (lower.endsWith('ies') && word.length > 3) {
    const dropped = word.slice(-3)
    const y = dropped === dropped.toUpperCase() ? 'Y' : 'y'
    const result = word.slice(0, -3) + y
    if (result.length > 2) {
      return result
    }
  }

  // -ves -> -f or -fe (wolves -> wolf, knives -> knife)
  if (lower.endsWith('ves')) {
    const stem = word.slice(0, -3)
    const dropped = word.slice(-3)
    const isUpper = dropped === dropped.toUpperCase()
    // Check if it should be -fe (like knife, wife, life)
    if (['kni', 'wi', 'li'].includes(stem.toLowerCase())) {
      return stem + (isUpper ? 'FE' : 'fe')
    }
    return stem + (isUpper ? 'F' : 'f')
  }

  // -oes -> -o (potatoes -> potato)
  if (lower.endsWith('oes')) {
    return word.slice(0, -2)
  }

  // Handle words ending in -nses (like responses, expenses, licenses)
  // These should only lose the final -s, not -es
  if (lower.endsWith('nses')) {
    return word.slice(0, -1)
  }

  if (lower.endsWith('zzes')) {
    return word.slice(0, -2)
  }
  if (lower.endsWith('zes')) {
    return word.slice(0, -1)
  }

  // -ses, -xes, -shes, -ches -> remove -es (boxes -> box)
  if (lower.endsWith('ses') || lower.endsWith('xes') ||
    lower.endsWith('shes') || lower.endsWith('ches')) {
    return word.slice(0, -2)
  }

  if (lower.endsWith('s') &&
    !lower.endsWith('ss') &&
    !lower.endsWith('us') &&
    word.length > 3
  ) {
    return word.slice(0, -1)
  }

  // If none of the rules apply, return as is
  return word
}


function find(obj: any, qkey: string): any[] {
  const vals: any[] = []
  const seen = new WeakSet<object>()
  const collect = (o: any): void => {
    if (!o || 'object' !== typeof o) return
    if (seen.has(o)) return
    seen.add(o)
    if (Array.isArray(o)) {
      for (let i = 0; i < o.length; i++) collect(o[i])
    } else {
      for (const k of Object.keys(o)) {
        const v = o[k]
        if (qkey === k) vals.push({ key: k, val: v, path: [] })
        if (v && 'object' === typeof v) collect(v)
      }
    }
  }
  collect(obj)
  return vals
}


function capture(data: any, shape: any): Record<string, any> {
  let meta = { capture: {} }
  let errs: any[] = []

  transform(data, shape, {
    extra: {
      $CAPTURE,
      $APPEND,
      $ANY,
      $SELECT,
      $LOWER: $RECASE,
      $UPPER: $RECASE,
    },
    errs,
    meta
  })

  if (0 < errs.length) {
    KONSOLE_LOG('ERRS', errs)
    dlog(errs)
  }
  return meta.capture
}


function $CAPTURE(inj: Injection) {
  // Set prop foo with value at x: { x: { '`$CAPTURE`': 'foo' } }
  if (M_KEYPRE === inj.mode) {
    const { val, prior } = inj
    if (null != prior) {
      const { dparent, key } = prior
      const dval = dparent?.[key]
      if (undefined !== dval) {
        inj.meta.capture[val] = dval
      }
    }
  }

  // Use key x as prop name: { x: '`$CAPTURE`': }
  else if (M_VAL === inj.mode) {
    const { key, dparent } = inj
    const dval = dparent?.[key]
    if (undefined !== dval) {
      inj.meta.capture[key] = dval
    }
  }
}


function $APPEND(inj: Injection, val: any, ref: any, store: any) {
  // Set prop foo with value at x: { x: { '`$CAPTURE`': 'foo' } }
  if (M_KEYPRE === inj.mode) {
    const { val, prior } = inj
    if (null != prior) {
      const { dparent, key } = prior
      const dval = dparent?.[key]
      if (undefined !== dval) {
        inj.meta.capture[val] = (inj.meta.capture[val] || [])
        inj.meta.capture[val].push(dval)
      }
    }
  }


  else if (M_VAL === inj.mode) {
    inj.keyI = inj.keys.length

    if (null == inj.prior) {
      return
    }

    const [_, prop, xform] = inj.parent
    const { key, dparent } = inj.prior
    const dval = dparent?.[key]

    const vstore = { ...store }
    vstore.$TOP = { [key]: dval }

    const ptval = inject({ [key]: xform }, vstore, {
      meta: { ...inj.meta },
      errs: inj.errs,
    })

    const tval = ptval[key]

    if (undefined !== tval) {
      inj.meta.capture[prop] = (inj.meta.capture[prop] || [])
      inj.meta.capture[prop].push(tval)
    }
  }
}



function $ANY(inj: Injection, _val: any, _ref: any, store: any) {
  if (M_KEYPRE === inj.mode) {
    const { prior } = inj
    const child = inj.parent[inj.key]
    if (null != prior) {
      const { dparent, key } = prior
      const dval = dparent?.[key]
      if (isnode(dval)) {
        for (let n of Object.entries(dval)) {
          let vstore = { ...store }
          vstore.$TOP = { [n[0]]: n[1] }
          inject(clone({ [n[0]]: child }), vstore, {
            meta: inj.meta,
            errs: inj.errs,
          })
        }
      }
    }
  }
}


function $SELECT(inj: Injection, _val: any, _ref: any, store: any) {
  if (M_VAL === inj.mode) {
    inj.keyI = inj.keys.length

    let [_, selector, descendor] = inj.parent

    const dparents =
      Object.entries(inj.dparent || {})
        .filter(n => isnode(n[1]))
        .reduce((a, n) => (a[n[0]] = n[1], a), ({} as any))

    if (selector instanceof RegExp) {
      selector = {
        '$KEY': { '`$LIKE`': selector.toString() }
      }
    }

    const children = select(dparents, selector)

    if (0 < children.length) {
      for (let child of children) {
        let vstore = { ...store }
        vstore.$TOP = { [child.$KEY]: child }

        inject(clone({ [child.$KEY]: descendor }), vstore, {
          meta: merge([
            inj.meta,

            { select: { key: { [slice(inj.path, 1, -1).join('+')]: child.$KEY } } }
          ]),
          errs: inj.errs,
        })
      }
    }
  }
}


function $RECASE(inj: Injection, val: any, ref: any, store: any) {
  if (
    M_KEYPRE === inj.mode
    && null != inj.prior
    && null != inj.prior.prior
  ) {
    const dval = inj.parent[inj.key]

    const dkey = inj.prior.key
    const gkey = inj.prior.prior.key

    const vstore = { ...store }
    vstore.$TOP = { [gkey]: { [dkey]: inj.dparent?.[dkey] } }

    const vspec = { [gkey]: { [dkey]: dval } }

    const ptval = inject(vspec, vstore, {
      meta: { ...inj.meta },
      errs: inj.errs,
    })

    let tval = ptval[gkey][dkey]

    if ('string' === typeof tval) {
      tval = '$UPPER' === ref ? tval.toUpperCase() : tval.toLowerCase()
    }

    inj.setval(tval, 2)
  }
}



type PathMatch = (string[] & { index: number, expr: string, path: string })

function pathMatch(path: string | string[], expr: string):
  null | PathMatch {

  if (null == path) {
    return null
  }

  const parts = (Array.isArray(path) ? path : path.split('/')).filter(p => '' !== p)
  const res: any = []
  res.index = -1
  res.expr = expr
  res.path = 'string' === typeof path ? path : '/' + path.join('/')

  const plen = parts.length
  const xlen = expr.length

  let xI = 0, pI = 0, mI = -1
  for (; pI <= parts.length; pI++) {
    let p = parts[pI]
    let x = expr[xI]
    let isp = isParam(p)

    if ('/' === x) {
      if (0 === xI) {
        if (0 === pI) {
          mI = 0
          pI--
          xI++
        }
        else {
          break
        }
      }
      else if (xI === xlen - 1) {
        if (pI === plen) {
          xI++
          break
        }
        else {
          if (-1 < mI) {
            // backtrack
            pI = mI
            mI = -1
          }
          xI = 0
        }
      }
      else if (xI < xlen - 1) {
        pI--
        xI++
      }
      else {
        xI = 0
        break
      }
    }
    else if ('t' === x && !isp) {
      xI++
      mI = mI < 0 ? pI : mI
    }
    else if ('p' === x && isp) {
      xI++
      mI = mI < 0 ? pI : mI
    }
    else {
      if (-1 < mI) {
        // backtrack
        pI = mI
        mI = -1
      }
      xI = 0
    }

    if (xI === xlen) {
      break
    }
  }

  if (xI === xlen) {
    res.index = mI
    res.push(...parts.slice(mI, pI + 1))
    return res
  }

  return null
}


function isParam(partStr: string) {
  return null != partStr && '{' === partStr[0] && '}' === partStr[partStr.length - 1]
}


function formatJSONIC(
  val?: any,
  opts?: {
    hsepd?: number,
    $?: boolean,
    color?: boolean
    maxlines?: number,
    exclude?: string[],
  }): string {

  if (undefined === val) return ''

  const hsepd = opts?.hsepd ?? 1
  const showd = !!opts?.$
  const useColor = opts?.color ?? false
  const maxlines = opts?.maxlines ?? Number.MAX_VALUE
  const exclude = opts?.exclude ?? []

  // ANSI color codes
  const colors = {
    reset: '\x1b[0m',
    key: '\x1b[94m',      // bright blue
    string: '\x1b[92m',   // bright green
    number: '\x1b[93m',   // bright yellow
    boolean: '\x1b[96m',  // bright cyan
    null: '\x1b[90m',     // bright gray
    bracket: '\x1b[37m',  // white
    comment: '\x1b[90m',  // bright gray
  }

  const c = (color: keyof typeof colors, text: string) =>
    useColor ? `${colors[color]}${text}${colors.reset}` : text

  const renderPrimitive = (v: any): string => {
    if (v === null) return c('null', 'null')
    const t = typeof v
    switch (t) {
      case 'string': return c('string', !v.includes('\n') ? JSON.stringify(v) :
        '`' + JSON.stringify(v)
          .substring(1)
          .replace(/\\n/g, '\n')
          .replace(/\\"/g, '"')
          .replace(/`/g, '\\`')
          .replace(/"$/, '`'))
      case 'number': return c('number', Number.isFinite(v) ? String(v) : 'null')
      case 'boolean': return c('boolean', v ? 'true' : 'false')
      case 'bigint': return c('string', JSON.stringify(v.toString()))
      case 'symbol':
      case 'function':
      case 'undefined':
        return c('null', 'null')
      default: return JSON.stringify(v)
    }
  }

  const renderComment = (c: any): string | null => {
    if (c == null) return null
    if (Array.isArray(c) && c.every(x => typeof x === 'string')) return c.join('; ')
    if (typeof c === 'string') return c
    try { return JSON.stringify(c) } catch { return String(c) }
  }

  return renderJSONIC(val, hsepd, showd, useColor, maxlines, exclude, c,
    renderPrimitive, renderComment, false)
}


function renderJSONIC(
  val: any,
  hsepd: number,
  showd: boolean,
  useColor: boolean,
  maxlines: number,
  exclude: string[],
  c: (color: any, text: string) => string,
  renderPrimitive: (v: any) => string,
  renderComment: (c: any) => string | null,
  decircularized: boolean,
): string {

  const space = '  '

  type ValueFrame = {
    kind: 'value'
    value: any
    indentLevel: number
    linePrefix: string
    inlineComment?: string | null
  }

  type CloseFrame = {
    kind: 'close'
    token: '}' | ']'
    indentLevel: number
    // The container this frame closes. `seen` tracks the ANCESTOR PATH, so
    // the node is removed again on the way out — otherwise a merely repeated
    // (shared) node is indistinguishable from a cycle.
    node?: any
  }

  const seen = new WeakSet()

  let stack = new Array<ValueFrame | CloseFrame | undefined>(32)
  let top = -1

  // Seed root frame, capturing a possible top-level _COMMENT
  let rootInline: string | null = null
  if (val && typeof val === 'object') {
    rootInline = renderComment((val as any)['_COMMENT'])
  }
  stack[++top] = {
    kind: 'value', value: val, indentLevel: 0, linePrefix: '', inlineComment: rootInline
  }

  const lines: string[] = []

  while (top >= 0 && (lines.length < maxlines)) {
    const frame = stack[top]!

    stack[top] = undefined
    top -= 1

    if (frame.kind === 'close') {
      if (undefined !== frame.node) {
        seen.delete(frame.node)
      }
      const indent = space.repeat(frame.indentLevel)
      const hsep = 0 < frame.indentLevel && frame.indentLevel <= hsepd
      lines.push(`${indent}${c('bracket', frame.token)}${hsep ? '\n' : ''}`)
      continue
    }

    let v = frame.value
    while (v && typeof v === 'object' && typeof (v as any).toJSON === 'function') {
      v = (v as any).toJSON()
    }

    const { indentLevel, linePrefix } = frame
    const commentSuffix = frame.inlineComment ? `  ${c('comment', `# ${frame.inlineComment}`)}` : ''

    if (v === null || typeof v !== 'object') {
      lines.push(`${linePrefix}${renderPrimitive(v)}${commentSuffix}`)
      continue
    }

    // Repeated reference — fall back to decircular, but only once.
    if (seen.has(v)) {
      if (!decircularized) {
        // decircular recurses per level, so a deep value can overflow the
        // stack inside it. This whole path usually runs while formatting an
        // error, so degrade to the marker instead of throwing over it.
        let flat: any
        try {
          flat = decircular(val)
        }
        catch (err: any) {
          flat = undefined
        }
        if (undefined !== flat) {
          return renderJSONIC(flat, hsepd, showd, useColor, maxlines, exclude, c,
            renderPrimitive, renderComment, true)
        }
      }
      // decircular did not resolve it, so render a marker rather than
      // recursing again. Better a placeholder than a crash while
      // formatting an error the user actually needs to read.
      lines.push(`${linePrefix}${c('string', '"[Circular]"')}${commentSuffix}`)
      continue
    }
    seen.add(v)

    if (Array.isArray(v)) {
      const arr = v as any[]
      if (arr.length === 0) {
        lines.push(`${linePrefix}${c('bracket', '[')}${commentSuffix}`)
        stack[++top] = { kind: 'close', token: ']', indentLevel, node: v }
        continue
      }

      // opening line
      lines.push(`${linePrefix}${c('bracket', '[')}${commentSuffix}`)
      stack[++top] = { kind: 'close', token: ']', indentLevel, node: v }

      // children (reverse push)
      const childPrefix = space.repeat(indentLevel + 1)
      for (let i = arr.length - 1; i >= 0; i--) {
        const idxComment = renderComment((v as any)[`${i}_COMMENT`])
        stack[++top] = {
          kind: 'value',
          value: arr[i],
          indentLevel: indentLevel + 1,
          linePrefix: `${childPrefix}`,
          inlineComment: idxComment
        }
      }
      continue
    }

    // Plain object
    const obj = v as Record<string, any>
    const keys = Object.keys(obj)
    if (v instanceof Error) {
      keys.unshift('name', 'message', 'stack')
    }

    const printableKeys = keys.filter(k => !k.endsWith('_COMMENT') &&
      (showd || !k.endsWith('$')))

    if (printableKeys.length === 0) {
      lines.push(`${linePrefix}${c('bracket', '{')}${commentSuffix}`)
      stack[++top] = { kind: 'close', token: '}', indentLevel, node: v }
      continue
    }

    // opening line
    lines.push(`${linePrefix}${c('bracket', '{')}${commentSuffix}`)
    stack[++top] = { kind: 'close', token: '}', indentLevel, node: v }

    const nextIndentStr = space.repeat(indentLevel + 1)
    for (let i = printableKeys.length - 1; i >= 0; i--) {
      const k = printableKeys[i]
      if (exclude.includes(k)) {
        continue
      }

      const keyText = quoteKey(k)
      const valForKey = obj[k]
      const cmt = renderComment(obj[`${k}_COMMENT`])

      stack[++top] = {
        kind: 'value',
        value: valForKey,
        indentLevel: indentLevel + 1,
        linePrefix: `${nextIndentStr}${c('key', keyText)}: `,
        inlineComment: cmt
      }
    }
  }

  return lines.join('\n') + '\n'
}


const VALID_CANON: Record<string, string> = Object.assign(Object.create(null), {
  'string': '`$STRING`',
  'number': '`$NUMBER`',
  'integer': '`$INTEGER`',
  'boolean': '`$BOOLEAN`',
  'null': '`$NULL`',
  'array': '`$ARRAY`',
  'object': '`$OBJECT`',
  'any': '`$ANY`',
})

const CANON_ONE = '`$ONE`'


function validator(torig: undefined | string | string[]): any {
  if ('string' === typeof torig) {
    const tstr = torig.toLowerCase().trim()
    const canon = VALID_CANON[tstr] ?? 'Any'
    return canon
  }
  else if (Array.isArray(torig)) {
    return [CANON_ONE, torig.map((t: string) => validator(t))]
  }
  else {
    return '`$ANY`'
  }
}

const FILE_EXT_RE =
  /\.(php|json|txt|png|jpg|jpeg|gif|svg|xml|html|csv|yml|yaml|md)$/i

function transliterate(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

const CANONIZE_CACHE = new Map<string, string>()

// A trailing plural after an acronym is part of the word, and snakify would
// split it letter by letter. See docs/design/derived-names.md
const ACRONYM_PLURAL_RE = /([A-Z]{2,})s(?![a-zA-Z])/g

function canonize(s: string) {
  if (null == s || '' === s) return ''
  const cached = CANONIZE_CACHE.get(s)
  if (undefined !== cached) return cached
  const deacronymed = transliterate(s)
    .replace(FILE_EXT_RE, '')
    .replace(ACRONYM_PLURAL_RE, (_m, run) => run[0] + run.slice(1).toLowerCase() + 's')
  const out = depluralize(snakify(deacronymed))
    .replace(/[^a-zA-Z_0-9]/g, '')
  CANONIZE_CACHE.set(s, out)
  return out
}


const CANONIZE_FIELD_CACHE = new Map<string, string>()

function resplitFromCmp(entname: string, cmp: string, why: string[]): string {
  if (null == entname || '' === entname || entname.includes('_')) {
    return entname
  }

  if (null == cmp || '' === cmp || !cmp.includes('_')) {
    return entname
  }

  const seg = cmp.split('_')
  let acc = ''

  for (let i = 0; i < seg.length; i++) {
    acc += seg[i]

    if (acc === entname) {
      const split = seg.slice(0, i + 1).join('_')
      why.push('resplit-from-cmp=' + split)
      return split
    }

    if (acc.length > entname.length) {
      return entname
    }
  }

  return entname
}


function canonizeField(s: string) {
  if (null == s || '' === s) return ''
  const cached = CANONIZE_FIELD_CACHE.get(s)
  if (undefined !== cached) return cached
  const out = transliterate(s).replace(/[^a-zA-Z_0-9]/g, '')
  CANONIZE_FIELD_CACHE.set(s, out)
  return out
}


function stripSchemaNamespace(name: string): string {
  if (null == name || !name.includes('.')) return name
  const segs = name.split('.')
  for (let i = segs.length - 1; i >= 0; i--) {
    const seg = segs[i]
    if (seg.length >= 3 && !/^v?\d+$/i.test(seg)) {
      return seg
    }
  }
  return name
}


// Canonical form of an OpenAPI component schema name, for use as an
// entity-name candidate and as the frequency-metric key. Must be applied
// uniformly wherever schema refs are counted or resolved (MeasureRef,
// ResolveEntityComponent, findcmps) so the metric keys stay consistent.
function canonizeCmpName(orig: string): string {
  return canonize(stripSchemaNamespace(orig))
}


const FIRST_LETTER_RE = /[a-zA-Z]/


function prefixLeadingDigit(s: string): string {
  if (null == s || '' === s) return s
  const first = s.charCodeAt(0)
  if (first < 48 || first > 57) return s
  const letter = s.match(FIRST_LETTER_RE)
  const upper = null != letter && letter[0] >= 'A' && letter[0] <= 'Z'
  return (upper ? 'N' : 'n') + s
}


// Sanitize a raw slug into a clean kebab-case string suitable for
// conversion to a valid JS identifier (via camelify/snakify/etc).
function sanitizeSlug(s: string): string {
  if (null == s || '' === s) return 'unknown'
  // Transliterate accented characters to ASCII
  let out = transliterate(s)
  // Replace underscores and dots with hyphens (treat as word separators)
  out = out.replace(/[_.]/g, '-')
  // Strip all non-alphanumeric, non-hyphen chars
  out = out.replace(/[^a-zA-Z0-9-]/g, '')
  // Collapse multiple/leading/trailing hyphens
  out = out.replace(/-+/g, '-').replace(/^-|-$/g, '')

  // Merge standalone number segments with preceding word
  // e.g. ec-2-shop -> ec2-shop, advice-slip-api-2 -> advice-slip-api2
  const raw = out.split('-').filter(p => p.length > 0)
  const parts: string[] = []
  for (const p of raw) {
    if (/^\d+$/.test(p) && parts.length > 0) {
      parts[parts.length - 1] += p
    } else {
      parts.push(p)
    }
  }
  out = parts.join('-')

  if (!out) return 'unknown'

  return prefixLeadingDigit(out)
}


// Convert a raw slug to a valid PascalCase identifier.
// Applies sanitizeSlug first, then converts to PascalCase.
function slugToPascalCase(s: string): string {
  const slug = sanitizeSlug(s)
  if (slug === 'unknown') return 'Unknown'
  return slug
    .split('-')
    .map(p => p.charAt(0).toUpperCase() + p.slice(1))
    .join('')
}


const BOOLEAN_NAME_RE = /^(is_|has_|can_|should_|allow_|enabled$|disabled$|active$|visible$|deleted$|verified$|public$|private$|locked$|archived$|blocked$)/
const INTEGER_NAME_RE = /(_count$|_number$|^total_|^count_|^num_|^limit$|^page$|^offset$|^per_page$|^page_size$|^size$|^skip$)/
const NUMBER_NAME_RE = /^(latitude$|longitude$|lat$|lng$|lon$|price$|amount$|rate$|score$|weight$|height$|width$|depth$|radius$|distance$|duration$|percentage$|percent$)/
const STRING_NAME_RE = /^(url$|href$|link$|uri$|email$|name$|title$|description$|slug$|path$|label$|username$|password$|token$|key$)/
const ID_NAME_RE = /(_id$|^id$)/

function inferFieldType(name: string, specType: string): string {
  // Only override $ANY, or $STRING for boolean-patterned names
  if ('`$ANY`' === specType) {
    if (BOOLEAN_NAME_RE.test(name)) return '`$BOOLEAN`'
    if (ID_NAME_RE.test(name)) return '`$STRING`'
    if (INTEGER_NAME_RE.test(name)) return '`$INTEGER`'
    if (NUMBER_NAME_RE.test(name)) return '`$NUMBER`'
    if (STRING_NAME_RE.test(name)) return '`$STRING`'
  }
  else if ('`$STRING`' === specType) {
    if (BOOLEAN_NAME_RE.test(name)) return '`$BOOLEAN`'
  }
  return specType
}


function humanTitle(name: string): string {
  return snakify(name).split('_').filter(Boolean)
    .map(word => word[0].toUpperCase() + word.slice(1)).join(' ')
}


function normalizeFieldName(s: string): string {
  if (null == s || '' === s) return ''
  return s
    .replace(/\[\]/g, '')
    .replace(/[\[\].]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
}


const MIN_ENTITY_NAME_LEN = 3
const MAX_ENTITY_NAME_LEN = 67

function ensureMinEntityName(
  name: string,
  existing: Record<string, any>,
): string {
  let padded = name.replace(/[^a-zA-Z_0-9]/g, '').replace(/^_+/, '')

  // Truncate sentence-length names by taking leading segments
  if (padded.length > MAX_ENTITY_NAME_LEN) {
    const parts = padded.split('_')
    let truncated = ''
    for (const part of parts) {
      const next = truncated === '' ? part : truncated + '_' + part
      if (next.length > MAX_ENTITY_NAME_LEN) break
      truncated = next
    }
    padded = truncated || parts[0].substring(0, MAX_ENTITY_NAME_LEN)
  }

  padded = prefixLeadingDigit(padded)
  if (padded.length < MIN_ENTITY_NAME_LEN) {
    const padding = 'nt'.substring(0, MIN_ENTITY_NAME_LEN - padded.length)
    padded = padded + padding
  }

  if (padded !== name && null != existing[padded]) {
    if (existing[padded].longname === name) {
      return padded
    }
    let i = 2
    while (null != existing[padded + i]) {
      if (existing[padded + i].longname === name) {
        return padded + i
      }
      i++
    }
    padded = padded + i
  }

  return padded
}


// Unconditional suffixes: framework noise, always stripped.
const CMP_SUFFIXES = ['_rest_controller', '_controller', '_response', '_request']

const CMP_GUARDED_SUFFIXES = ['_create_response', '_update_response', '_page_response', '_page']

const CMP_RESULT_VERBS = [
  'list', 'create', 'show', 'update', 'delete', 'remove',
  'get', 'edit', 'resolve', 'rotate', 'search',
]

const CMP_PREFIXES = ['get_', 'post_', 'put_', 'delete_', 'patch_']

// A guide node (entity, path or op) is active unless guide.aontu explicitly
// says otherwise. `active` has always been declared in the guide model and
// documented as the escape hatch for a misclassified entity; this is the
// single place that decides what it means, so entity/flow/operation transforms
// cannot drift on it.
function guideActive(node: any): boolean {
  return false !== node?.active
}


const AUTH_TOKEN_FIELDS = [
  'access_token', 'accessToken', 'access-token',
  'id_token', 'idToken',
  'token', 'jwt',
]

// What the exchange SENDS. Optional: an operation answering with an access
// token is an exchange whether or not apidef recognises the credential it
// was bought with, and sdkgen carries its own default for the field name.
const AUTH_CREDENTIAL_FIELDS = [
  'refresh_token', 'refreshToken', 'refresh-token',
  'client_secret', 'clientSecret',
  'assertion', 'grant_type', 'grantType',
  'api_key', 'apiKey', 'apikey',
  'password', 'code',
]

function authExchangeOp(
  op: any,
  specSecured: boolean
): { request: string | null, response: string } | null {
  if (true !== specSecured) {
    return null
  }

  if (!Array.isArray(op?.security) || 0 !== op.security.length) {
    return null
  }

  if ('POST' !== String(op?.method ?? '').toUpperCase()) {
    return null
  }

  const response = firstFieldMatch(
    schemaProps(successResponseSchema(op?.responses)), AUTH_TOKEN_FIELDS)

  if (null == response) {
    return null
  }

  const request = firstFieldMatch(
    schemaProps(requestBodySchema(op?.requestBody)), AUTH_CREDENTIAL_FIELDS)

  return { request, response }
}


// Does the spec require a credential by default? Only a non-empty top-level
// `security` makes a per-operation `security: []` meaningful.
function specSecuredByDefault(def: any): boolean {
  return Array.isArray(def?.security) && 0 < def.security.length
}


// The 2xx body schema, OpenAPI 3 (`content`) or Swagger 2 (`schema`).
function successResponseSchema(responses: any): any {
  const res = responses?.['200'] ?? responses?.[200] ??
    responses?.['201'] ?? responses?.[201]
  if (null == res) {
    return null
  }
  return res.content?.['application/json']?.schema ?? res.schema ?? null
}


function requestBodySchema(requestBody: any): any {
  if (null == requestBody) {
    return null
  }
  return requestBody.content?.['application/json']?.schema ?? null
}


function schemaProps(schema: any): string[] {
  const props = schema?.properties
  if (null == props || 'object' !== typeof props) {
    return []
  }
  return Object.keys(props)
}


function firstFieldMatch(props: string[], names: string[]): string | null {
  const lower = new Map<string, string>()
  for (const p of props) {
    const k = p.toLowerCase()
    if (!lower.has(k)) {
      lower.set(k, p)
    }
  }
  for (const name of names) {
    const hit = lower.get(name.toLowerCase())
    if (null != hit) {
      return hit
    }
  }
  return null
}


function cleanComponentName(
  name: string,
  isKnownCmp?: (canonizedRemainder: string) => boolean
): string {
  let cleaned = name
  let stripped = false

  // Version-tolerant known-schema probe. APIs that version their schemas name
  // the base type SeverityV1 / IncidentV2, so a guard asking only for
  // 'severity' misses by exactly the version suffix and every wrapper survives.
  const knownWithVersion = (remainder: string, version: string | null) => {
    if (null == isKnownCmp) return false
    if (isKnownCmp(remainder)) return true
    return null != version && isKnownCmp(remainder + '_v' + version)
  }

  // Split a trailing _v<N> off before any suffix matching, and remember it for
  // the guard probe above. If nothing ends up stripping, the version is put
  // BACK: a versioned schema that is a real entity (IncidentV2) must keep its
  // name, or every such API silently renames.
  let version: string | null = null
  const preVersion = cleaned
  {
    const vm = cleaned.match(/^(.*)_v(\d+)$/)
    if (vm) {
      version = vm[2]
      cleaned = vm[1]
    }
  }

  // <namespace>_<verb>[_<object>]_result -> the object, else the namespace.
  if (null != isKnownCmp && cleaned.endsWith('_result')) {
    const base = cleaned.slice(0, -'_result'.length)
    const parts = base.split('_')
    const vI = parts.findIndex(p => CMP_RESULT_VERBS.includes(p))
    if (vI >= 0) {
      const after = parts.slice(vI + 1).join('_')
      const before = parts.slice(0, vI).join('_')
      const cands = after
        ? [canonize(depluralize(after)), canonize(depluralize(before + '_' + after))]
        : [canonize(depluralize(before))]
      for (const cand of cands) {
        if (cand.length >= 3 && knownWithVersion(cand, version)) {
          return cand
        }
      }
    }
  }

  if (null != isKnownCmp) {
    for (const suffix of CMP_GUARDED_SUFFIXES) {
      if (cleaned.endsWith(suffix)) {
        const parts = cleaned.split('_')
        const suffixParts = suffix.split('_').filter(s => s !== '').length
        const remainder = canonize(parts.slice(0, parts.length - suffixParts).join('_'))
        if (remainder.length >= 3 && knownWithVersion(remainder, version)) {
          cleaned = remainder
          stripped = true
        }
        break
      }
    }
  }

  if (!stripped) {
    for (const suffix of CMP_SUFFIXES) {
      if (cleaned.endsWith(suffix)) {
        const parts = cleaned.split('_')
        const suffixParts = suffix.split('_').filter(s => s !== '').length
        cleaned = canonize(parts.slice(0, parts.length - suffixParts).join('_'))
        break
      }
    }
  }

  // Nothing stripped it: restore the version suffix removed above.
  if (!stripped && cleaned === preVersion.replace(/_v\d+$/, '') && null != version) {
    cleaned = preVersion
  }

  for (const prefix of CMP_PREFIXES) {
    if (cleaned.startsWith(prefix)) {
      const remainder = cleaned.substring(prefix.length)
      if (remainder.length >= 3) {
        cleaned = remainder
      }
      break
    }
  }

  return cleaned
}


function warnOnError(where: string, warn: Warner, fn: Function, result?: any) {
  try {
    return fn()
  }
  catch (err: any) {
    warn({
      note: 'Error in ' + where + ': ' + err.message,
      err
    })
    return result
  }
}



function debugpathOn(): boolean {
  const apipath = process.env.APIDEF_DEBUG_PATH
  return null != apipath && '' !== apipath
}


function debugpath(pathStr: string, methodName: string | null | undefined, ...args: any[]): void {
  const apipath = process.env.APIDEF_DEBUG_PATH

  if (null == apipath || '' === apipath) return

  if ('ALL' !== apipath) {
    const [targetPath, targetMethod] = apipath.split(':')

    // Check if path matches
    if (pathStr !== targetPath) return

    if (targetMethod && methodName) {
      if (methodName.toLowerCase() !== targetMethod.toLowerCase()) return
    }
  }

  KONSOLE_LOG(methodName || '', ...args)
}


function findPathsWithPrefix(
  ctx: any,
  pathStr: string,
  opts?: { strict?: boolean, param?: boolean }
): number {
  const strict = opts?.strict ?? false
  const param = opts?.param ?? false

  if (!param) {
    pathStr = pathStr.replace(/\{[^}]+\}/g, '{}')
  }

  const matchingPaths = each(ctx.def.paths)
    .filter((pathDef: any) => {
      let path = pathDef.key$
      if (!param) {
        path = path.replace(/\{[^}]+\}/g, '{}')
      }
      if (strict) {
        // Strict mode: path must start with prefix and have more segments
        return path.startsWith(pathStr) && path.length > pathStr.length
      } else {
        // Non-strict mode: simple prefix match
        return path.startsWith(pathStr)
      }
    })

  return matchingPaths.length
}


function allcapify(s?: string) {
  return 'string' === typeof s ? snakify(s).toUpperCase() : ''
}


// Get value from object as string, and format as indicated.
// Example: nom({foo:'bar'},'Foo') -> 'Bar'
function nom(v: any, format: string): string {
  let formatstr = 'string' == typeof format ? format : null
  if (null == formatstr) {
    return '__MISSING__'
  }
  const canon = canonize(formatstr)
  let out = v?.[canon] ?? '__MISSING_' + formatstr + '__'
  out =
    /[A-Z][a-z]/.test(formatstr) ? camelify(out) :
      /[A-Z][A-Z]/.test(formatstr) ? allcapify(out) :
        /-/.test(formatstr) ? kebabify(out) : out

  return out
}


function relativizePath(path: string): string {
  const cwd = process.cwd()
  if (path.startsWith(cwd)) {
    return '.' + path.slice(cwd.length)
  }
  return path
}


// NOTE: removes inactive items by default
function getModelPath(
  model: any,
  path: string,
  flags?: { required?: boolean, only_active?: boolean }
): any {
  const required = flags?.required ?? true
  const only_active = flags?.only_active ?? true

  if (path === '') {
    if (required) {
      throw new Error('getModelPath: empty path provided')
    }
    return undefined
  }

  const parts = path.split('.')
  const fullPath = path  // Store the full path for error messages
  let current = model
  let validPath: string[] = []

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]

    if (current == null) {
      if (required) {
        const validPathStr = validPath.length > 0 ? validPath.join('.') : '(root)'
        throw new Error(
          `getModelPath: path not found at '${fullPath}'.\n` +
          `Valid path up to: '${validPathStr}'.\n` +
          `Cannot access property '${part}' of ${current === null ? 'null' : 'undefined'}.`
        )
      }
      return undefined
    }

    // Check if current is an object before using 'in' operator
    if (typeof current !== 'object' || current === null) {
      if (required) {
        const validPathStr = validPath.length > 0 ? validPath.join('.') : '(root)'
        throw new Error(
          `getModelPath: path not found at '${fullPath}'.\n` +
          `Valid path up to: '${validPathStr}'.\n` +
          `Cannot access property '${part}' of ${typeof current}.`
        )
      }
      return undefined
    }

    // Check if the key exists
    if (!(part in current)) {
      if (required) {
        const validPathStr = validPath.length > 0 ? validPath.join('.') : '(root)'
        const availableKeys = Array.isArray(current)
          ? `array indices 0-${current.length - 1}`
          : `[${Object.keys(current).join(', ')}]`

        throw new Error(
          `getModelPath: path not found at '${fullPath}'.\n` +
          `Valid path up to: '${validPathStr}'.\n` +
          `Property '${part}' does not exist.\n` +
          `Available keys: ${availableKeys}`
        )
      }
      return undefined
    }

    validPath.push(part)
    current = current[part]
  }

  if (current && only_active) {
    if (false === current.active) {
      current = undefined
    }
    if ('object' === typeof current) {
      const out: any = Array.isArray(current) ? [] : {}
      Object.entries(current).map((n: any) => {
        if (null != n[1] && false !== n[1].active) {
          if (Array.isArray(out)) {
            out.push(n[1])
          }
          else {
            out[n[0]] = n[1]
          }
        }
      })
      current = out
    }
  }

  return current
}

export type {
  PathMatch
}


// A response property only "wraps" the entity when it is itself a structured
// value that could contain the entity: an object, an array, a $ref, or a
// composed (allOf/oneOf/anyOf) schema. A scalar property (string, integer,
// number, boolean) that merely shares the entity's name is a field of the
// entity, not a wrapper, so the response must not be unwrapped down to it.
function isEntityWrapperProp(propSchema: any): boolean {
  if (null == propSchema || 'object' !== typeof propSchema) {
    return false
  }
  if (null != propSchema.$ref) {
    return true
  }
  if (null != propSchema.properties ||
    null != propSchema.items ||
    null != propSchema.allOf ||
    null != propSchema.oneOf ||
    null != propSchema.anyOf) {
    return true
  }
  const t = propSchema.type
  return 'object' === t || 'array' === t
}


function envelopeProp(resprops: any, opname: string): string | null {
  const keys = keysof(resprops)
  if (0 === keys.length) {
    return null
  }

  const structured = keys.filter((k: string) => isEntityWrapperProp(resprops[k]))
  if (1 !== structured.length) {
    return null
  }

  const key = structured[0]
  const prop = resprops[key]

  const islist = propIsList(prop)
  if (null == islist || islist !== ('list' === opname)) {
    return null
  }

  return key
}


function untaggedUnionBranches(schema: any): number {
  if (null == schema || 'object' !== typeof schema) {
    return 0
  }
  if (null != schema.discriminator) {
    return 0
  }
  const branches = schema.oneOf ?? schema.anyOf
  if (!Array.isArray(branches) || branches.length < 2) {
    return 0
  }
  const real = branches.filter((b: any) => null != b && 'null' !== b.type)
  return real.length < 2 ? 0 : real.length
}


function scanUntaggedUnion(
  schema: any,
  depth: number = 0,
  seen: Set<any> = new Set()
): null | { count: number, branches: number, depth: number } {
  if (null == schema || 'object' !== typeof schema ||
    seen.has(schema) || depth > MAX_UNION_SCAN_DEPTH) {
    return null
  }
  seen.add(schema)

  let count = 0
  let branches = 0
  let at = 0

  const here = untaggedUnionBranches(schema)
  if (0 < here) {
    count = 1
    branches = here
    at = depth
  }

  for (const child of Object.values(schema)) {
    if (null == child || 'object' !== typeof child) {
      continue
    }
    const found = scanUntaggedUnion(child, depth + 1, seen)
    if (null == found) {
      continue
    }
    count += found.count
    if (found.branches > branches) {
      branches = found.branches
    }
    if (found.depth > at) {
      at = found.depth
    }
  }

  return 0 === count ? null : { count, branches, depth: at }
}

const MAX_UNION_SCAN_DEPTH = 64


function propIsList(schema: any): boolean | null {
  if (null == schema || 'object' !== typeof schema) {
    return null
  }

  const branches = schema.allOf ?? schema.oneOf ?? schema.anyOf
  if (Array.isArray(branches)) {
    if (0 === branches.length) {
      return null
    }
    const first = propIsList(branches[0])
    if (null == first) {
      return null
    }
    for (const branch of branches) {
      if (propIsList(branch) !== first) {
        return null
      }
    }
    return first
  }

  return 'array' === schema.type || null != schema.items
}


function closedBodyTransform(schema: any): Record<string, string> | null {
  if (null == schema || 'object' !== typeof schema) {
    return null
  }
  if (false !== schema.additionalProperties) {
    return null
  }

  const names = keysof(schema.properties)
  if (0 === names.length) {
    return null
  }

  const out: Record<string, string> = Object.create(null)
  for (const name of names) {
    out[name] = '`reqdata.' + canonize(normalizeFieldName(name)) + '`'
  }
  return out
}

function firstSentence(text: string): string {
  const collapsed = text.replace(/\s+/g, ' ').trim()
  const m = collapsed.match(/^(.+?[.!?])(\s|$)/)
  let out = m ? m[1] : collapsed
  const MAX = 240
  if (out.length > MAX) {
    out = out.slice(0, MAX - 1).trimEnd() + '\u2026'
  }
  return out
}


export {
  nom,
  getdlog,
  loadFile,
  formatJsonSrc,
  depluralize,
  setCustomPlurals,
  clearCustomPlurals,
  find,
  capture,
  pathMatch,
  makeWarner,
  formatJSONIC,
  validator,
  VALID_CANON,
  CANON_ONE,
  canonize,
  canonizeField,
  canonizeCmpName,
  stripSchemaNamespace,
  sanitizeSlug,
  slugToPascalCase,
  transliterate,
  cleanComponentName,
  guideActive,
  authExchangeOp,
  specSecuredByDefault,
  ensureMinEntityName,
  inferFieldType,
  normalizeFieldName,
  humanTitle,
  prefixLeadingDigit,
  debugpath,
  debugpathOn,
  findPathsWithPrefix,
  writeFileSyncWarn,
  warnOnError,
  relativizePath,
  getModelPath,
  sortedKeys,
  sortedEntries,
  isEntityWrapperProp,
  envelopeProp,
  closedBodyTransform,
  untaggedUnionBranches,
  scanUntaggedUnion,
  firstSentence,
  resplitFromCmp,
}
