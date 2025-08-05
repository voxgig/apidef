
import Path from 'node:path'


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


/*
function writeChanged(
  point: string, path: string, content: string,
  fs: FsUtil, log: Log,
  flags?: { update?: boolean }
) {
  let exists = false
  let changed = false

  flags = flags || {}
  flags.update = null == flags.update ? true : !!flags.update

  let action = ''
  try {
    let existingContent: string = ''
    path = Path.normalize(path)

    exists = fs.existsSync(path)

    if (exists) {
      action = 'read'
      existingContent = fs.readFileSync(path, 'utf8')
    }

    changed = existingContent !== content

    action = flags.update ? 'write' : 'skip'

    log.info({
      point: 'write-' + point,
      note: (changed ? '' : 'not-') + 'changed ' + path,
      write: 'file', skip: !changed, exists, changed,
      contentLength: content.length, file: path
    })

    if (!exists || (changed && flags.update)) {
      fs.writeFileSync(path, content)
    }
  }
  catch (err: any) {
    log.error({
      fail: action, point, file: path, exists, changed,
      contentLength: content.length, err
    })
    err.__logged__ = true
    throw err
  }
}
*/


export {
  getdlog,
  loadFile,
  formatJsonSrc,
  depluralize,

  // writeChanged,
}
