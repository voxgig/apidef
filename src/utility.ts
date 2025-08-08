
import Path from 'node:path'

import { slice, merge, inject, clone, isnode, walk, transform, select } from '@voxgig/struct'


import type {
  FsUtil,
  Log
} from './types'


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
    'analyses': 'analysis',
    'appendices': 'appendix',
    'axes': 'axis',
    'children': 'child',
    'courses': 'course',
    'crises': 'crisis',
    'criteria': 'criterion',
    'data': 'datum',
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
  if (word.endsWith('s') && !word.endsWith('ss')) {
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
      $LOWER,
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

    // console.log('SELECT-FROM', dparents)

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


function $LOWER(inj: any, val: any, ref: any, store: any) {
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
      tval = tval.toLowerCase()
    }

    inj.setval(tval, 2)
  }
}




export {
  getdlog,
  loadFile,
  formatJsonSrc,
  depluralize,
  find,
  capture,
}
