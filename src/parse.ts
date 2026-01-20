/* Copyright (c) 2024-2025 Voxgig, MIT License */

import { bundleFromString, createConfig } from '@redocly/openapi-core'

import decircular from 'decircular'

import { relativizePath } from './utility'



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


async function parseOpenAPI(source: any, meta?: any) {
  const base = meta?.config || {}
  const config: any = await createConfig(base)

  // First pass: parse without dereferencing to preserve $refs
  const bundleWithRefs = await bundleFromString({
    source,
    config,
    dereference: false,
  })

  // Walk the tree and add x-ref properties
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

  addXRefs(bundleWithRefs.bundle.parsed)

  // Serialize back to string with x-refs preserved
  const sourceWithXRefs = JSON.stringify(decircular(bundleWithRefs.bundle.parsed))

  // Second pass: parse with dereferencing
  const bundle = await bundleFromString({
    source: sourceWithXRefs,
    // source,
    config,
    dereference: true,
  })

  const def = decircular(bundle.bundle.parsed)

  return def
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
