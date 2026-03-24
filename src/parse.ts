/* Copyright (c) 2024-2025 Voxgig, MIT License */

import { Jsonic } from 'jsonic'
import { Yaml } from '@jsonic/yaml'

import { decircular } from '@voxgig/util'

import { relativizePath } from './utility'


const yamlParser = Jsonic.make().use(Yaml)


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
      `@voxgig/apidef: parse: Unsupported OpenAPI version: undefined`
    )
  }

  // Ensure components exists (Redocly used to add this automatically)
  if (null == parsed.components) {
    parsed.components = {}
  }

  // Walk the tree and add x-ref properties (preserving original $ref values)
  const seen = new WeakSet()
  let refCount = 0

  function addXRefs(obj: any, path: string = '') {
    if (!obj || typeof obj !== 'object' || seen.has(obj)) return
    seen.add(obj)

    if (Array.isArray(obj)) {
      obj.forEach((item, index) => addXRefs(item, `${path}[${index}]`))
    } else {
      // Check for $ref property
      if (obj.$ref && typeof obj.$ref === 'string') {
        obj['x-ref'] = obj.$ref
        refCount++
      }

      // Recursively process all properties
      for (const [key, value] of Object.entries(obj)) {
        if (value && typeof value === 'object') {
          addXRefs(value, path ? `${path}.${key}` : key)
        }
      }
    }
  }

  addXRefs(parsed)

  // Resolve $ref pointers
  resolveRefs(parsed, parsed)

  const def = decircular(parsed)

  return def
}


// Resolve all $ref JSON pointers in an object tree.
// Replaces { $ref: "#/path/to/target", "x-ref": "..." } with the
// resolved target's properties, preserving x-ref.
function resolveRefs(obj: any, root: any, visited?: WeakSet<any>) {
  if (!obj || typeof obj !== 'object') return
  if (!visited) visited = new WeakSet()
  if (visited.has(obj)) return
  visited.add(obj)

  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      const item = obj[i]
      if (item && typeof item === 'object' && typeof item.$ref === 'string') {
        const resolved = resolvePointer(root, item.$ref)
        if (resolved !== undefined) {
          const xref = item['x-ref']
          obj[i] = { ...resolved }
          if (xref) {
            obj[i]['x-ref'] = xref
          }
          resolveRefs(obj[i], root, visited)
        }
      } else {
        resolveRefs(item, root, visited)
      }
    }
  } else {
    for (const key of Object.keys(obj)) {
      const val = obj[key]
      if (val && typeof val === 'object' && typeof val.$ref === 'string') {
        const resolved = resolvePointer(root, val.$ref)
        if (resolved !== undefined) {
          const xref = val['x-ref']
          obj[key] = { ...resolved }
          if (xref) {
            obj[key]['x-ref'] = xref
          }
          resolveRefs(obj[key], root, visited)
        }
      } else {
        resolveRefs(val, root, visited)
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

  // Remove YAML comment lines (lines that start with # after
  // optional whitespace)
  const withoutComments = source.replace(/^\s*#.*$/gm, '')

  if (withoutComments.trim().length === 0) {
    throw new Error(
      `@voxgig/apidef: parse: ${kind}: source is empty` +
      ` (${relativizePath(meta.file)})`
    )
  }
}


export {
  parse,
}
