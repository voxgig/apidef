/* Copyright (c) 2024-2026 Voxgig Ltd, MIT License */

// See docs/design/resolved-spec-capability.md

import { graphqlInputTypes } from './transform/contract'


const METHODS = [
  'get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'
]


type OperationFacts = {
  protocol: 'http' | 'graphql'
  [key: string]: any
}


type ResolvedSpec = {
  version: 1
  kind: string

  // The PARSED definition, not the bytes on disk: path keys are normalised
  // during parse, so a consumer reading the file itself would miss lookups.
  def: any

  operation(method: string, path: string): OperationFacts | undefined
}


// The single definition of a resolved operation, shared by contractTransform
// and by consumers of the capability, so the two cannot disagree.
function operationFacts(def: any, point: { method: string, orig: string }): OperationFacts | undefined {
  const path = def?.paths?.[point.orig]
  const method = path?.[String(point.method).toLowerCase()]
  const graphql = def?.query?.[point.orig] || def?.mutation?.[point.orig]

  if (!method && !graphql) return undefined

  const facts: any = { protocol: graphql ? 'graphql' : 'http' }

  if (graphql) {
    facts.field = graphql
    facts.types = graphqlInputTypes(graphql, def.types || {})
    facts.typesScope = 'inputs'
    return facts
  }

  for (const key of ['operationId', 'requestBody', 'responses', 'consumes', 'produces']) {
    if (undefined !== method[key]) facts[key] = method[key]
  }

  // A path item may declare parameters shared by every operation under it.
  facts.parameters = [...(path.parameters || []), ...(method.parameters || [])]

  facts.security = method.security ?? def.security
  facts.securitySource = method.security !== undefined ? 'operation' :
    def.security !== undefined ? 'definition' : 'unspecified'

  // swagger2 names this `securityDefinitions`.
  facts.securitySchemes = def.components?.securitySchemes ?? def.securityDefinitions

  facts.consumes ??= def.consumes
  facts.produces ??= def.produces

  return facts
}


// Every described operation, keyed 'METHOD path' as `point.contract.id` is.
function operationIndex(def: any): { [id: string]: OperationFacts } {
  const out: { [id: string]: OperationFacts } = {}

  for (const path of Object.keys(def?.paths || {})) {
    for (const method of METHODS) {
      if (null == def.paths[path]?.[method]) continue
      const facts = operationFacts(def, { method, orig: path })
      if (facts) out[method.toUpperCase() + ' ' + path] = facts
    }
  }

  for (const kind of ['query', 'mutation']) {
    for (const field of Object.keys(def?.[kind] || {})) {
      const facts = operationFacts(def, { method: 'POST', orig: field })
      if (facts) out['POST ' + field] = facts
    }
  }

  return out
}


function makeResolved(kind: string, def: any): ResolvedSpec {
  return {
    version: 1,
    kind,
    def,
    operation: (method: string, path: string) =>
      operationFacts(def, { method, orig: path }),
  }
}


// Tolerates a missing context: apidef also runs outside a model build.
function publishResolved(ctx: any, kind: string, def: any): ResolvedSpec {
  const resolved = makeResolved(kind, def)
  if (null != ctx && 'object' === typeof ctx) {
    ctx.state = ctx.state || {}
    ctx.state.apidef = { ...(ctx.state.apidef || {}), resolved }
  }
  return resolved
}


function resolvedSpec(carrier: any): ResolvedSpec | undefined {
  if (null == carrier || 'object' !== typeof carrier) return undefined
  return carrier.state?.apidef?.resolved ??
    carrier.ctx?.state?.apidef?.resolved ??
    carrier.apidef?.resolved ??
    undefined
}


export type {
  OperationFacts,
  ResolvedSpec,
}

export {
  METHODS,
  operationFacts,
  operationIndex,
  makeResolved,
  publishResolved,
  resolvedSpec,
}
