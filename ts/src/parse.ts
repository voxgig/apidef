/* Copyright (c) 2024-2025 Voxgig, MIT License */

import { Jsonic } from 'jsonic'
import { Yaml } from '@jsonic/yaml'

import { relativizePath } from './utility'


const yamlParser = Jsonic.make().use(Yaml)

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

  // Ensure components exists (Redocly used to add this automatically)
  if (null == parsed.components) {
    parsed.components = {}
  }

  // Normalize path keys: jsonic's YAML parser leaves the surrounding double
  // quotes IN the key for explicit-key form (`? "..."`). gitlab uses this for
  // long paths and as a result every downstream split('/') sees a literal
  // quote character at the head/tail of the path, breaking URL substitution.
  if (parsed.paths && 'object' === typeof parsed.paths) {
    const cleaned: Record<string, any> = {}
    for (const [k, v] of Object.entries(parsed.paths)) {
      const stripped = k.replace(/^"+|"+$/g, '')
      cleaned[stripped] = v
    }
    parsed.paths = cleaned
  }

  // Single-pass: add x-ref properties and resolve $ref pointers together.
  addXRefsAndResolve(parsed, parsed)

  const def = decycle(parsed)

  return def
}


// Break reference cycles so the parsed spec stays JSON-serializable, WITHOUT
// destroying the structure sharing that $ref inlining deliberately creates.
//
// @voxgig/util's decircular() rebuilds the tree — it allocates a fresh object
// per *visit*, so a component reachable by k distinct paths is copied k times
// and the result is the tree-expansion of the DAG, size O(fanout^depth). That
// is catastrophic on exactly the shape real specs have (components reused
// across nesting levels): a 2.3 KB spec with 12 levels and 3 refs per level
// expanded to a 172 MB model, and 13 levels exhausted a 2 GB heap.
//
// Cycles are real here — inlining a self-referential schema makes the copy's
// `properties` the same object as the original's, so the copy contains
// itself — so they still have to be cut. This does it in place: only the edge
// that closes a cycle is replaced (with decircular's marker string, so the
// output shape is unchanged), every other node is visited exactly once and
// left shared. Linear in the number of distinct nodes.
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

    // The YAML parser hands back null-prototype objects. decircular() used to
    // launder them into plain objects as a side effect of rebuilding the tree;
    // parse()'s result is public, so keep that contract (callers reasonably
    // expect `hasOwnProperty` etc. on a parsed spec) rather than leaking the
    // parser's internal shape now that nothing is rebuilt.
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


// Single-pass tree walk that:
// 1. Preserves original $ref values as x-ref
// 2. Resolves $ref JSON pointers in-place
//
// NOTE: resolution inlines a shallow copy of the target ({ ...resolved }),
// so multiple references to the same component share that component's
// nested child objects. Downstream consumers must therefore treat the
// resolved schema as read-only — mutating an inlined sub-object would leak
// across every site that referenced the same component. (A deep clone is
// deliberately avoided: schemas can be self-referential, which would make
// cloning non-terminating.)
function addXRefsAndResolve(obj: any, root: any, visited?: WeakSet<any>) {
  if (!obj || typeof obj !== 'object') return
  if (!visited) visited = new WeakSet()
  if (visited.has(obj)) return
  visited.add(obj)

  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      const item = obj[i]
      if (item && typeof item === 'object') {
        if (typeof item.$ref === 'string') {
          const xref = item.$ref
          const resolved = resolvePointer(root, xref)
          if (resolved !== undefined) {
            obj[i] = { ...resolved, 'x-ref': xref }
            addXRefsAndResolve(obj[i], root, visited)
          } else {
            item['x-ref'] = xref
            addXRefsAndResolve(item, root, visited)
          }
        } else {
          addXRefsAndResolve(item, root, visited)
        }
      }
    }
  } else {
    for (const key of Object.keys(obj)) {
      const val = obj[key]
      if (val && typeof val === 'object') {
        if (typeof val.$ref === 'string') {
          const xref = val.$ref
          const resolved = resolvePointer(root, xref)
          if (resolved !== undefined) {
            obj[key] = { ...resolved, 'x-ref': xref }
            addXRefsAndResolve(obj[key], root, visited)
          } else {
            val['x-ref'] = xref
            addXRefsAndResolve(val, root, visited)
          }
        } else {
          addXRefsAndResolve(val, root, visited)
        }
      }
    }
  }
}


// Follow a JSON pointer like "#/components/schemas/Planet".
//
// Alias components — `Foo: { $ref: '#/components/schemas/Bar' }` — are a
// normal OpenAPI idiom, so a pointer can land on another bare $ref node.
// Follow the chain to its end rather than returning the intermediate: the
// caller inlines `{ ...resolved }`, and a `$ref` *string* key in that spread
// is never followed by the object-valued recursion in addXRefsAndResolve, so
// stopping early yields a schema with no properties and every field is
// silently dropped. Whether that happened used to depend on whether `paths`
// or `components` came first in the document, because resolution reads a root
// the same walk is still mutating.
//
// `seen` holds pointer strings (not object identities) so a self- or
// mutually-referential alias cycle terminates instead of looping forever.
function resolvePointer(root: any, ref: string): any {
  const seen = new Set<string>()
  let current: any = undefined
  let pointer = ref

  for (; ;) {
    if (!pointer.startsWith('#/')) return undefined
    if (seen.has(pointer)) return undefined
    seen.add(pointer)

    const parts = pointer
      .substring(2)
      .split('/')
      .map(p => p.replace(/~1/g, '/').replace(/~0/g, '~'))

    current = root
    for (const part of parts) {
      if (current == null || typeof current !== 'object') return undefined
      current = current[part]
    }

    // Landed on another alias: follow it. Anything else is the target.
    if (current != null &&
      'object' === typeof current &&
      !Array.isArray(current) &&
      'string' === typeof current.$ref) {
      pointer = current.$ref
      continue
    }

    return current
  }
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
}
