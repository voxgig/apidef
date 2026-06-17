/* Copyright (c) 2024-2025 Voxgig, MIT License */

import { Jsonic } from 'jsonic'
import { Yaml } from '@jsonic/yaml'

import { decircular } from '@voxgig/util'

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

  const def = decircular(parsed)

  return def
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


// Follow a JSON pointer like "#/components/schemas/Planet"
function resolvePointer(root: any, ref: string): any {
  if (!ref.startsWith('#/')) return undefined

  const parts = ref
    .substring(2)
    .split('/')
    .map(p => p.replace(/~1/g, '/').replace(/~0/g, '~'))

  let current = root
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined
    current = current[part]
  }

  return current
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
