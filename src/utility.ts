
import Path from 'node:path'

import { snakify, camelify, kebabify, each } from 'jostraca'

import { decircular } from '@voxgig/util'

import {
  slice, merge, inject, clone, isnode, walk, transform, select
} from '@voxgig/struct'


import type {
  FsUtil,
  Log,
  Warner,
} from './types'



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
      note: 'Unable to save file: ' + path
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
    .replace(/"([a-zA-Z_][a-zA-Z_0-9]*)": /g, '$1: ')
    .replace(/},/g, '}\n')
    // .replace(/([a-zA-Z_][a-zA-Z_0-9]*)_COMMENT:/g, '# $1')
    .replace(/\n(\s*)([a-zA-Z_][a-zA-Z_0-9]*)_COMMENT:\s*"(.*)",/g, '\n\n$1# $2 $3')
}


function depluralize(word: string): string {
  if (!word || word.length === 0) {
    return word
  }

  // Common irregular plurals
  const irregulars: Record<string, string> = {
    'analytics': 'analytics',
    'analyses': 'analysis',
    'appendices': 'appendix',
    'axes': 'axis',
    'children': 'child',
    'courses': 'course',
    'crises': 'crisis',
    'criteria': 'criterion',
    // 'data': 'datum',
    'diagnoses': 'diagnosis',
    'feet': 'foot',
    'furnace': 'furnaces',
    'geese': 'goose',
    'horses': 'horse',
    'house': 'houses',
    'indices': 'index',
    'license': 'licenses',
    'matrices': 'matrix',
    'men': 'man',
    'mice': 'mouse',
    'notice': 'notices',
    'oases': 'oasis',
    'releases': 'release',
    'people': 'person',
    'phenomena': 'phenomenon',
    'practice': 'practices',
    'promise': 'promises',
    'teeth': 'tooth',
    'theses': 'thesis',
    'vertices': 'vertex',
    'women': 'woman',
  }

  if (irregulars[word]) {
    return irregulars[word]
  }

  for (let ending in irregulars) {
    if (word.endsWith(ending)) {
      return word.replace(ending, irregulars[ending])
    }
  }

  // Rules for regular plurals (applied in order)

  if (word.endsWith('ies') && word.length > 3) {
    return word.slice(0, -3) + 'y'
  }


  // -ies -> -y (cities -> city)
  if (word.endsWith('ies') && word.length > 3) {
    return word.slice(0, -3) + 'y'
  }

  // -ves -> -f or -fe (wolves -> wolf, knives -> knife)
  if (word.endsWith('ves')) {
    const stem = word.slice(0, -3)
    // Check if it should be -fe (like knife, wife, life)
    if (['kni', 'wi', 'li'].includes(stem)) {
      return stem + 'fe'
    }
    return stem + 'f'
  }

  // -oes -> -o (potatoes -> potato)
  if (word.endsWith('oes')) {
    return word.slice(0, -2)
  }

  // Handle words ending in -nses (like responses, expenses, licenses)
  // These should only lose the final -s, not -es
  if (word.endsWith('nses')) {
    return word.slice(0, -1)
  }

  // -ses, -xes, -zes, -shes, -ches -> remove -es (boxes -> box)
  if (word.endsWith('ses') || word.endsWith('xes') || word.endsWith('zes') ||
    word.endsWith('shes') || word.endsWith('ches')) {
    return word.slice(0, -2)
  }

  // -s -> remove -s (cats -> cat)
  if (word.endsWith('s') &&
    !word.endsWith('ss') &&
    !word.endsWith('us')
  ) {
    return word.slice(0, -1)
  }

  // If none of the rules apply, return as is
  return word
}


function find(obj: any, qkey: string): any[] {
  let vals: any[] = []
  walk(obj, (key: any, val: any, _p: any, t: string[]) => {
    if (qkey === key) {
      vals.push({ key, val, path: t })
    }
    return val
  })
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
    console.log('ERRS', errs)
    dlog(errs)
  }
  return meta.capture
}


function $CAPTURE(inj: any) {
  // Set prop foo with value at x: { x: { '`$CAPTURE`': 'foo' } }
  if ('key:pre' === inj.mode) {
    const { val, prior } = inj
    const { dparent, key } = prior
    const dval = dparent?.[key]
    if (undefined !== dval) {
      inj.meta.capture[val] = dval
    }
  }

  // Use key x as prop name: { x: '`$CAPTURE`': }
  else if ('val' === inj.mode) {
    const { key, dparent } = inj
    const dval = dparent?.[key]
    if (undefined !== dval) {
      inj.meta.capture[key] = dval
    }
  }
}


function $APPEND(inj: any, val: any, ref: any, store: any) {
  // Set prop foo with value at x: { x: { '`$CAPTURE`': 'foo' } }
  if ('key:pre' === inj.mode) {
    const { val, prior } = inj
    const { dparent, key } = prior
    const dval = dparent?.[key]
    if (undefined !== dval) {
      inj.meta.capture[val] = (inj.meta.capture[val] || [])
      inj.meta.capture[val].push(dval)
    }
  }


  else if ('val' === inj.mode) {
    inj.keyI = inj.keys.length

    const [_, prop, xform] = inj.parent
    const { key, dparent } = inj.prior
    const dval = dparent?.[key]

    const vstore = { ...store }
    vstore.$TOP = { [key]: dval }

    // const ptval = transform({ [key]: dval }, { [key]: xform }, {
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



function $ANY(inj: any, _val: any, _ref: any, store: any) {
  if ('key:pre' === inj.mode) {
    const { prior } = inj
    const child = inj.parent[inj.key]
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


function $SELECT(inj: any, _val: any, _ref: any, store: any) {
  if ('val' === inj.mode) {
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

    // TODO: select should be safe for scalars
    const children = select(dparents, selector)

    if (0 < children.length) {
      for (let child of children) {
        let vstore = { ...store }
        vstore.$TOP = { [child.$KEY]: child }

        inject(clone({ [child.$KEY]: descendor }), vstore, {
          meta: merge([
            inj.meta,

            // TODO: need this hack as struct does not provide a way to get grandparent keys
            // also, these capture actions are not preserving the path!
            { select: { key: { [slice(inj.path, 1, -1).join('+')]: child.$KEY } } }
          ]),
          errs: inj.errs,
        })
      }
    }
  }
}


function $RECASE(inj: any, val: any, ref: any, store: any) {
  if ('key:pre' === inj.mode) {
    const dval = inj.parent[inj.key]

    // TODO: handle paths more generally! use inj.prior?
    // TODO: mkae this into a utility method on inj?
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

// A special-purpose regex-style matcher for url paths.
//   t - text part
//   p - param part
//   / - part separator
//   / at start - must match from start
//   / at end - must match to end
// See utility.test.ts for examples
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

  val = decircular(val)

  const hsepd = opts?.hsepd ?? 1
  const showd = !!opts?.$
  const useColor = opts?.color ?? false
  const maxlines = opts?.maxlines ?? Number.MAX_VALUE
  const exclude = opts?.exclude ?? []

  const space = '  '
  const isBareKey = (k: string) => /^[A-Za-z_][_A-Za-z0-9]*$/.test(k)
  const quoteKey = (k: string) => (isBareKey(k) ? k : JSON.stringify(k))

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
          .replace(/\\"/g, ':')
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
  }

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

    if (Array.isArray(v)) {
      const arr = v as any[]
      if (arr.length === 0) {
        lines.push(`${linePrefix}${c('bracket', '[')}${commentSuffix}`)
        stack[++top] = { kind: 'close', token: ']', indentLevel }
        continue
      }

      // opening line
      lines.push(`${linePrefix}${c('bracket', '[')}${commentSuffix}`)
      stack[++top] = { kind: 'close', token: ']', indentLevel }

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
      stack[++top] = { kind: 'close', token: '}', indentLevel }
      continue
    }

    // opening line
    lines.push(`${linePrefix}${c('bracket', '{')}${commentSuffix}`)
    stack[++top] = { kind: 'close', token: '}', indentLevel }

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


const VALID_CANON: Record<string, string> = {
  'string': '`$STRING`',
  'number': '`$NUMBER`',
  'integer': '`$INTEGER`',
  'boolean': '`$BOOLEAN`',
  'null': '`$NULL`',
  'array': '`$ARRAY`',
  'object': '`$OBJECT`',
  'any': '`$ANY`',
}


function validator(torig: undefined | string | string[]): any {
  if ('string' === typeof torig) {
    const tstr = torig.toLowerCase().trim()
    const canon = VALID_CANON[tstr] ?? 'Any'
    return canon
  }
  else if (Array.isArray(torig)) {
    return ['`$ONE`', torig.map((t: string) => validator(t))]
  }
  else {
    return '`$ANY`'
  }
}

function canonize(s: string) {
  return depluralize(snakify(s)).replace(/[^a-zA-Z_0-9]/g, '')
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



function debugpath(pathStr: string, methodName: string | null | undefined, ...args: any[]): void {
  const apipath = process.env.APIDEF_DEBUG_PATH
  if (!apipath) return

  const [targetPath, targetMethod] = apipath.split(':')

  // Check if path matches
  if (pathStr !== targetPath) return

  // If a method is specified in apipath and we have a method name, check if it matches
  if (targetMethod && methodName) {
    if (methodName.toLowerCase() !== targetMethod.toLowerCase()) return
  }

  console.log(methodName || '', ...args)
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


// TODO: move to jostraca?
function allcapify(s?: string) {
  return 'string' === typeof s ? snakify(s).toUpperCase() : ''
}


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

export type {
  PathMatch
}

export {
  nom,
  getdlog,
  loadFile,
  formatJsonSrc,
  depluralize,
  find,
  capture,
  pathMatch,
  makeWarner,
  formatJSONIC,
  validator,
  canonize,
  debugpath,
  findPathsWithPrefix,
  writeFileSyncWarn,
  warnOnError,

}
