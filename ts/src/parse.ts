/* Copyright (c) 2024-2025 Voxgig, MIT License */

import { Jsonic } from '@tabnas/jsonic'
import { Yaml } from '@tabnas/yaml'

import { relativizePath } from './utility'

import { parseGraphQL } from './parse/graphql'


// NOTE: @tabnas/yaml types its Plugin against @tabnas/parser, while
// Jsonic.use expects @tabnas/jsonic's own (structurally identical) Plugin
// type - hence the cast.
const yamlParser = Jsonic.make().use(Yaml as any)

// Matches any line that is not purely a YAML comment or whitespace.
const RE_HAS_CONTENT = /^\s*[^#\s]/m


// Parse an API definition source into a JSON sructure.
async function parse(kind: string, source: any, meta: { file: string }) {
  if ('OpenAPI' === kind) {

    validateSource(kind, source, meta)

    try {
      const def = await parseOpenAPI(source, meta)
      return def
    }
    catch (pe: any) {
      if (pe.originalError) {
        pe.originalError.message =
          `@voxgig/apidef: parse: syntax: ${pe.originalError.message}` +
          ` (${relativizePath(meta.file)})`
        pe = pe.originalError
      }
      else if (pe.code && pe.code.startsWith('jsonic')) {
        pe.message =
          `@voxgig/apidef: parse: syntax: ${pe.message}` +
          ` (${relativizePath(meta.file)})`
      }
      else {
        pe.message =
          `@voxgig/apidef: parse: internal: ${pe.message}` +
          ` (${relativizePath(meta.file)})`
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


async function parseOpenAPI(source: any, _meta?: any) {
  let parsed: any

  try {
    parsed = yamlParser(source)
  }
  catch (err: any) {
    // Rethrow jsonic parse errors with context
    throw err
  }

  // Validate parsed result is a non-null object
  if (null == parsed || 'object' !== typeof parsed || Array.isArray(parsed)) {
    throw new Error(
      `@voxgig/apidef: parse: JSON/YAML source must be an object`
    )
  }

  // Validate it's an OpenAPI or Swagger spec
  if (!parsed.openapi && !parsed.swagger) {
    throw new Error(
      `@voxgig/apidef: parse: Unsupported spec: missing 'openapi' or 'swagger' version field`
    )
  }

  if (SURROGATE_RE.test(source)) {
    parsed = wellFormed(parsed, new Map())
  }

  if (null == parsed.components) {
    parsed.components = {}
  }

  if (isRecord(parsed.paths)) {
    parsed.paths = renameKeys(parsed.paths, normalizePathKeys(Object.keys(parsed.paths)))
  }

  // Single-pass: add x-ref properties and resolve $ref pointers together.
  addXRefsAndResolve(parsed, parsed)

  // After resolution, so a pointer into `paths` names the key as written and a
  // parameter declared by `$ref` counts. See docs/design/derived-names.md
  normalizeColonPathParams(parsed, _meta)

  const def = decycle(parsed)

  return def
}


// A surrogate escape, or a raw lone surrogate unit.
const SURROGATE_RE =
  /\\(?:u\{?|U)0*[dD][89a-fA-F][0-9a-fA-F]{2}|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/

const LONE_SURROGATE_RE =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g


function wellFormedString(s: string): string {
  return s.replace(LONE_SURROGATE_RE, '�')
}


// The Go parser reads a lone surrogate as U+FFFD, and so does every UTF-8
// writer. Keys it makes equal merge as the parser merges a repeated key.
function wellFormed(node: any, done: Map<any, any>): any {
  if ('string' === typeof node) return wellFormedString(node)
  if (null == node || 'object' !== typeof node) return node
  if (done.has(node)) return done.get(node)

  if (Array.isArray(node)) {
    done.set(node, node)
    for (let i = 0; i < node.length; i++) node[i] = wellFormed(node[i], done)
    return node
  }

  const out = Object.create(Object.getPrototypeOf(node))
  done.set(node, out)
  for (const key of Object.keys(node)) {
    const wkey = wellFormedString(key)
    const val = wellFormed(node[key], done)
    const prev = Object.prototype.hasOwnProperty.call(out, wkey) ? out[wkey] : undefined
    out[wkey] = null == prev ? val : Jsonic.util.deep(prev, val)
  }
  return out
}


function renameKeys(obj: any, keys: string[]): any {
  const out = Object.create(Object.getPrototypeOf(obj))
  Object.keys(obj).forEach((key, i) => { out[keys[i]] = obj[key] })
  return out
}


// @tabnas/yaml keeps the quotes of an explicit key (`? "/a"`, `? '/a'`) in the
// key. A rename that would collide with another key is not made.
function normalizePathKeys(keys: string[]): string[] {
  return keepDistinct(keys, keys.map(unquotePathKey))
}


function unquotePathKey(key: string): string {
  if (key.length < 2 || key[0] !== key[key.length - 1]) return key
  if ("'" === key[0]) return key.slice(1, -1).replace(/''/g, "'")
  if ('"' !== key[0]) return key
  try {
    const decoded = JSON.parse(key)
    if ('string' === typeof decoded) return wellFormedString(decoded)
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


function refSiblings(node: any): any {
  const out: any = {}
  for (const k of Object.keys(node)) {
    if ('$ref' === k) continue
    out[k] = node[k]
  }
  return out
}


function addXRefsAndResolve(
  obj: any,
  root: any,
  visited: WeakSet<any> = new WeakSet(),
  expanding: Map<any, any> = new Map(),
) {
  if (!obj || typeof obj !== 'object') return
  if (visited.has(obj)) return
  visited.add(obj)

  const keys: (string | number)[] =
    Array.isArray(obj) ? Array.from(obj.keys()) : Object.keys(obj)

  for (const key of keys) {
    const val = obj[key]
    if (val && typeof val === 'object') {
      if (typeof val.$ref === 'string') {
        resolveRefSite(obj, key, root, visited, expanding)
      } else {
        addXRefsAndResolve(val, root, visited, expanding)
      }
    }
  }
}


function resolveRefSite(
  holder: any,
  key: string | number,
  root: any,
  visited: WeakSet<any>,
  expanding: Map<any, any>,
) {
  const site = holder[key]

  const inProgress = expanding.get(site)
  if (undefined !== inProgress) {
    holder[key] = inProgress
    return
  }

  const xref = site.$ref
  const resolved = resolvePointer(root, xref)
  if (resolved === undefined) {
    site['x-ref'] = xref
    addXRefsAndResolve(site, root, visited, expanding)
    return
  }

  const copy = { ...resolved, ...refSiblings(site), 'x-ref': xref }
  holder[key] = copy
  expanding.set(site, copy)
  addXRefsAndResolve(copy, root, visited, expanding)
  expanding.delete(site)
}


const INDEX_RE = /^(0|[1-9]\d*)$/


function isRecord(node: any): boolean {
  return null != node && 'object' === typeof node && !Array.isArray(node)
}


function isAlias(node: any): boolean {
  return isRecord(node) && 'string' === typeof node.$ref
}


// An own key of an object, or an RFC 6901 index of an array.
function pointerChild(node: any, part: string): any {
  if (Array.isArray(node)) {
    return INDEX_RE.test(part) && Number(part) < node.length ? node[Number(part)] : undefined
  }
  return isRecord(node) && Object.prototype.hasOwnProperty.call(node, part) ?
    node[part] : undefined
}


// The object a pointer names, following every alias met on the way, so the
// answer does not depend on which aliases the walk has already replaced. A
// pointer that names no object, or needs itself, names nothing.
function resolvePointer(root: any, ref: string, active: Set<string> = new Set()): any {
  if (!ref.startsWith('#/') || active.has(ref)) return undefined
  active.add(ref)

  let node: any = root
  for (const raw of ref.substring(2).split('/')) {
    node = pointerChild(followAlias(root, node, active),
      raw.replace(/~1/g, '/').replace(/~0/g, '~'))
    if (undefined === node) break
  }
  node = followAlias(root, node, active)

  active.delete(ref)
  return isRecord(node) ? node : undefined
}


// An alias's own keywords win over its target's. Without them the target
// itself is the answer, so references keep sharing one object.
function followAlias(root: any, node: any, active: Set<string>): any {
  if (!isAlias(node)) return node
  const target = resolvePointer(root, node.$ref, active)
  if (undefined === target) return undefined
  const sib = refSiblings(node)
  return 0 === Object.keys(sib).length ? target : { ...target, ...sib }
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
