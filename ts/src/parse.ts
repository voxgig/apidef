/* Copyright (c) 2024-2025 Voxgig, MIT License */

import {
  parse as readOpenAPI,
  resolve as resolveOpenAPI,
  wellFormed,
} from '@tabnas/openapi'

import { relativizePath } from './utility'

import { parseGraphQL } from './parse/graphql'


// Matches any line that is not purely a YAML comment or whitespace.
const RE_HAS_CONTENT = /^\s*[^#\s]/m


// Parse an API definition source into a JSON sructure.
async function parse(kind: string, source: any, meta: { file: string }) {
  if ('OpenAPI' === kind) {

    try {
      const def = await parseOpenAPI(source, meta)
      return def
    }
    catch (pe: any) {
      const where = ` (${relativizePath(meta.file)})`
      if (isOwnError(pe)) {
        pe.message += where
      }
      // The reader's refusals carry a code.
      else if ('string' === typeof pe.code) {
        pe.message = `@voxgig/apidef: parse: syntax: ${pe.message}` + where
      }
      else {
        pe.message = `@voxgig/apidef: parse: internal: ${pe.message}` + where
      }

      throw pe
    }
  }
  else if ('GraphQL' === kind) {

    validateSource(kind, source, meta)

    try {
      const def = await parseGraphQL(source, meta, (meta as any).graphql)
      return def
    }
    catch (pe: any) {
      // Already-decorated errors (missing endpoint, missing package) carry
      // the package prefix; only raw parser failures need wrapping.
      if ('string' === typeof pe.message &&
        !pe.message.startsWith('@voxgig/apidef:')) {
        pe.message =
          `@voxgig/apidef: parse: syntax: ${pe.message}` +
          ` (${relativizePath(meta.file)})`
      }

      throw pe
    }
  }
  else {
    throw new Error(
      `@voxgig/apidef: parse: unknown kind: ${kind}` +
      ` (${relativizePath(meta.file)})`
    )
  }
}


function isOwnError(err: any): boolean {
  return 'string' === typeof err?.message && err.message.startsWith('@voxgig/apidef:')
}


async function parseOpenAPI(source: any, _meta?: any) {
  if ('string' !== typeof source) {
    throw new Error(`@voxgig/apidef: parse: OpenAPI: source must be a string`)
  }

  let parsed: any

  try {
    // The reader's size limit is for a process of unknown memory; this one
    // has always read whatever it was given.
    parsed = readOpenAPI(source, { duplicates: 'merge', maxBytes: Infinity })
  }
  catch (err: any) {
    const code = err?.code
    if ('openapi_root' === code && 'empty' === err.details?.kind) {
      throw new Error(`@voxgig/apidef: parse: OpenAPI: source is empty`)
    }
    if ('openapi_alias_budget' === code) {
      throw new Error(
        `@voxgig/apidef: parse: OpenAPI: YAML aliases would expand the source to` +
        ` about ${err.details.size} bytes, past the limit of ${err.details.budget}`
      )
    }
    if ('openapi_root' === code || 'openapi_stream' === code) {
      throw new Error(
        `@voxgig/apidef: parse: JSON/YAML source must be an object`
      )
    }
    throw err
  }

  // Validate it's an OpenAPI or Swagger spec
  if (!parsed.openapi && !parsed.swagger) {
    throw new Error(
      `@voxgig/apidef: parse: Unsupported spec: missing 'openapi' or 'swagger' version field`
    )
  }

  // A lone surrogate is read as U+FFFD, which is what an encoder writes in
  // its place in UTF-8. Keys that this makes equal are merged, as the
  // reader merges a repeated key.
  parsed = wellFormed(parsed, { duplicates: 'merge' })

  if (null == parsed.components) {
    parsed.components = {}
  }

  if (isRecord(parsed.paths)) {
    parsed.paths = renameKeys(parsed.paths, normalizePathKeys(Object.keys(parsed.paths)))
  }

  parsed = resolveOpenAPI(parsed, { compat: 'apidef' }).tree

  // After resolution, so a pointer into `paths` names the key as written and a
  // parameter declared by `$ref` counts. See docs/design/derived-names.md
  normalizeColonPathParams(parsed, _meta)
  dropIgnoredHeaders(parsed)

  const def = decycle(parsed)

  return def
}


// In an OpenAPI 3 definition, a header parameter named Accept, Content-Type or
// Authorization is ignored: responses, the request body and the security
// schemes say those. Each dropped one is recorded for a warning.
const IGNORED_HEADERS = ['accept', 'content-type', 'authorization']
const IGNORED_HEADERS_KEY = 'x-apidef-ignored-headers'

function dropIgnoredHeaders(parsed: any) {
  delete parsed[IGNORED_HEADERS_KEY]
  if (!String(parsed.openapi ?? '').startsWith('3') || !isRecord(parsed.paths)) return

  const dropped: { path: string, method?: string, name: string }[] = []
  const kept = (list: any[], path: string, method?: string) => list.filter((param: any) => {
    const ignored = isRecord(param) && 'header' === param.in && 'string' === typeof param.name &&
      IGNORED_HEADERS.includes(param.name.toLowerCase())
    if (ignored) dropped.push({ path, ...(method ? { method: method.toUpperCase() } : {}), name: param.name })
    return !ignored
  })

  for (const path of Object.keys(parsed.paths).sort()) {
    const item = parsed.paths[path]
    if (!isRecord(item)) continue
    if (Array.isArray(item.parameters)) item.parameters = kept(item.parameters, path)
    for (const method of METHODS) {
      const op = item[method]
      if (isRecord(op) && Array.isArray(op.parameters)) op.parameters = kept(op.parameters, path, method)
    }
  }

  if (0 < dropped.length) parsed[IGNORED_HEADERS_KEY] = dropped
}


function renameKeys(obj: any, keys: string[]): any {
  const out = Object.create(Object.getPrototypeOf(obj))
  Object.keys(obj).forEach((key, i) => { out[keys[i]] = obj[key] })
  return out
}


// A path key that still carries its quotes loses them. A rename that would
// collide with another key is not made.
function normalizePathKeys(keys: string[]): string[] {
  return keepDistinct(keys, keys.map(unquotePathKey))
}


function unquotePathKey(key: string): string {
  if (key.length < 2 || key[0] !== key[key.length - 1]) return key
  if ("'" === key[0]) return key.slice(1, -1).replace(/''/g, "'")
  if ('"' !== key[0]) return key
  try {
    const decoded = JSON.parse(key)
    if ('string' === typeof decoded) return wellFormed(decoded)
  }
  catch (_e: any) {
    // Not a JSON string: an escape only YAML knows, so strip the quotes alone.
  }
  return key.slice(1, -1)
}


function keepDistinct(keys: string[], next: string[]): string[] {
  const count = new Map<string, number>()
  keys.forEach((key, i) => {
    count.set(key, (count.get(key) ?? 0) + 1)
    if (next[i] !== key) count.set(next[i], (count.get(next[i]) ?? 0) + 1)
  })
  return keys.map((key, i) => next[i] !== key && 1 < (count.get(next[i]) ?? 0) ? key : next[i])
}


// Edges decycle cut, so the guide can still count through them; a clone has none.
const DECYCLED = new WeakMap<object, Map<string, object>>()


function decycledChild(holder: any, key: string | number): any {
  const cut = DECYCLED.get(holder)?.get(String(key))
  return undefined === cut ? holder[key] : cut
}


function decycle(root: any) {
  // Entry path of each node on the current ancestor chain; presence in this
  // map is what identifies a back-edge. Nodes are removed on the way out, so
  // a node reachable twice as a *sibling* is not treated as a cycle.
  const onPath = new Map<any, string[]>()
  // Fully-processed nodes. Revisiting one is legitimate sharing, not a cycle,
  // and must not be walked (or copied) again.
  const done = new WeakSet<any>()
  const path: string[] = []

  const walk = (node: any) => {
    if (null == node || 'object' !== typeof node) return
    if (done.has(node)) return

    if (!Array.isArray(node) && null === Object.getPrototypeOf(node)) {
      Object.setPrototypeOf(node, Object.prototype)
    }

    onPath.set(node, path.slice())

    const keys = Array.isArray(node) ?
      node.map((_: any, i: number) => i) : Object.keys(node)

    for (const key of keys as any[]) {
      const val = node[key]
      if (null == val || 'object' !== typeof val) continue

      const cyclePath = onPath.get(val)
      if (undefined !== cyclePath) {
        let cuts = DECYCLED.get(node)
        if (undefined === cuts) {
          cuts = new Map()
          DECYCLED.set(node, cuts)
        }
        cuts.set(String(key), val)
        node[key] = `[Circular *${cyclePath.join('.')}]`
        continue
      }

      path.push(String(key))
      walk(val)
      path.pop()
    }

    onPath.delete(node)
    done.add(node)
  }

  walk(root)
  return root
}


function isRecord(node: any): boolean {
  return null != node && 'object' === typeof node && !Array.isArray(node)
}


function validateSource(kind: string, source: any, meta: { file: string }) {
  if (typeof source !== 'string') {
    throw new Error(
      `@voxgig/apidef: parse: ${kind}: source must be a string` +
      ` (${relativizePath(meta.file)})`
    )
  }

  // Check if source has any non-comment, non-whitespace content
  // without creating a full string copy.
  if (!RE_HAS_CONTENT.test(source)) {
    throw new Error(
      `@voxgig/apidef: parse: ${kind}: source is empty` +
      ` (${relativizePath(meta.file)})`
    )
  }
}


export {
  parse,
  decycledChild,
  normalizePathKeys,
  colonPathKeys,
  IGNORED_HEADERS_KEY,
}


const METHODS = [
  'get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'
]


// Rewrite `/a/:b/c` to `/a/{b}/c`, for a `:b` the path or one of its
// operations declares `in: path`. See docs/design/derived-names.md
function normalizeColonPathParams(parsed: any, meta?: any) {
  if (!isRecord(parsed.paths)) return

  const paths = Object.keys(parsed.paths)
  const next = colonPathKeys(parsed.paths)
  parsed.paths = renameKeys(parsed.paths, next)

  const renamed = paths.filter((path, i) => next[i] !== path)
  if (0 < renamed.length && null != meta?.log?.info) {
    meta.log.info({
      point: 'path-colon-params',
      count: renamed.length,
      note: 'rewrote ' + renamed.length + ' colon-style path parameter(s) to' +
        ' OpenAPI brace form, e.g. ' + renamed[0]
    })
  }
}


// Every `in: path` name counts: the path item's parameters and each operation's.
function colonPathKeys(paths: Record<string, any>): string[] {
  const keys = Object.keys(paths)
  return keepDistinct(keys, keys.map((path) => {
    if (!path.includes('/:')) return path

    const item = paths[path]
    const declared = new Set<string>()
    const collect = (params: any) => {
      if (!Array.isArray(params)) return
      for (const param of params) {
        if (param && 'path' === param.in && 'string' === typeof param.name) {
          declared.add(param.name)
        }
      }
    }
    if (null != item) {
      collect(item.parameters)
      for (const method of METHODS) {
        if (null != item[method]) collect(item[method].parameters)
      }
    }

    return path.split('/').map((seg) =>
      seg.startsWith(':') && declared.has(seg.slice(1)) ? '{' + seg.slice(1) + '}' : seg
    ).join('/')
  }))
}
