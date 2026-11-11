/* Copyright (c) 2026 Voxgig, MIT License */

// The neural guide strategy: each per-route classification is a small
// network over named features, with weights set by hand (see
// docs/design/neural-guide.md); the relational measurements and the
// post-passes are the heuristic's own, reused.

import * as Fs from 'node:fs'
import * as Path from 'node:path'

import { snakify } from 'jostraca'

import { merge, clone, isempty } from '@voxgig/struct'

import {
  canonize,
  canonizeCmpName,
  canonizeParam,
  cleanComponentName,
  depluralize,
  ensureMinEntityName,
  findPathsWithPrefix,
  normalizeFieldName,
  pathMatch,
  resplitFromCmp,
  sortedEntries,
  sortedKeys,
  find,
  wrapperOf,
  literalName,
  paramOf,
  guideParts,
  guidePath,
  paramNoun,
  READ_METHODS,
  cmpRefName,
  mergedProperties,
  isEntityWrapperProp,
  envelopeProp,
  envelopeItemRef,
  composedEnvelopeProp,
  propIsList,
  authExchangeOp,
  specSecuredByDefault,
  itemEnvelopeKey,
  itemEnvelopeTransform,
  responseSchema,
  rangeResponse,
  cmpNamespace,
  wordBreaks,
  recordLists,
  singleEnvelope,
  answersPage,
  pageTransform,
  stripOperationVerb,
  pluralize,
} from '../utility'

import { findExampleObject } from '../transform/field'

import type { PathMatch } from '../utility'

import { countRefs, byCodePoint, satAdd } from '../refcount'

import { mergeCollectionPaths, mergeCommandEntities, mergeFoldedEntities } from '../transform/entity'

import { requestSchema } from '../transform/body'

import {
  answeredRefs,
  namingRef,
  namingSchemas,
  pathResource,
  sharedRoutes,
  distinctShare,
  entityParamNames,
  isNameParam,
  isVerb,
  verbParts,
  pathRecordRef,
  matchEntityPath,
  keyParamOf,
  pathNoun,
  commandBodyName,
  commandTwin,
  itemAbove,
  pathQualified,
  readsRecord,
  recordOf,
  tagHolds,
  wrapsLiteral,
  responsePayload,
  isListResponse,
  LITERAL_LAST_SHAPES,
  READ_VERBS,
  verbOfItem,
  shortLiteral,
  normalizeParams,
  cleanCmp,
  commandSource,
  relationshipOf,
  singletonOf,
  subWriteOfItem,
  variantOfCollection,
  keyNounOf,
  asyncResultOf,
  nounless,
  collectionOwner,
  listedRefs,
  pathAnswersPage,
  pathAnswersRecordMap,
  randomRoute,
  selectorRoute,
  namedRecord,
  verbAfterNoun,
  warnListBody,
} from './heuristic01'

import { decide, explain, loadNets } from './nn'

import type { Net, Vec, Decision } from './nn'

import type {
  ApiDefContext,
  Guide,
  GuideEntity,
  GuidePath,
  GuideRenameParam,
} from '../types'


const IS_ENTCMP_METHOD_RATE = 0.21
const IS_ENTCMP_PATH_RATE = 0.41

const PATH_NAME_INDEX: Record<string, number> = {
  't/p/t/': 2, 't/p/': 0, 'p/t/': 1, 't/': 0, 't/p/p': 0,
}

const METHOD_CONSIDER_ORDER: Record<string, number> = {
  GET: 100, QUERY: 150, POST: 200, PUT: 300, PATCH: 400, DELETE: 500, HEAD: 600, OPTIONS: 700,
}

const METHOD_FEATURES: Record<string, string> = {
  GET: 'm_get', QUERY: 'm_query', POST: 'm_post', PUT: 'm_put', PATCH: 'm_patch',
  DELETE: 'm_delete', HEAD: 'm_head', OPTIONS: 'm_options',
}

const SHAPE_FEATURES: Record<string, string> = {
  't/p/t/': 'shape_tpt', 't/p/': 'shape_tp', 'p/t/': 'shape_pt', 't/': 'shape_t', 't/p/p': 'shape_tpp',
}


type Route = {
  path: string
  method: string
  parts: string[]
  pm: PathMatch | null
  operationId?: string
  tags: string[]
  responses: Record<string, any>
  requestBody: any
  security: any
  deprecated: boolean
  op?: string
  why_op: string[]
  cmp: Cmp | null
  why_cmp: string[]
  entname?: string
  same_path?: string
  verb_on_parent?: string
  view_on_parent?: boolean
  view_action?: string
  collection_action?: string
  post_read?: boolean
  singleton?: boolean
  record_named?: boolean
}

type Cmp = {
  ref: string
  cmp: string
  origcmp: string
  origcmpref: string | null
  cmpoccur: number
  path_rate: number
  method_rate: number
  rescmp?: string
  rescmpoccur?: number
}

type EntPath = {
  pm: PathMatch | null
  why_path: string[]
  rename: { param: Record<string, string> }
  why_rename: { why_param: Record<string, string[]> }
  action: Record<string, { why_action: string[] }>
  op: Record<string, any>
  ops: number
  deprecated_ops: number
}

type Ent = {
  name: string
  longname: string
  cmp: string | null
  origcmp: string | null
  ref: string
  why_path: string[]
  path: Record<string, EntPath>
  total_ops: number
  authexchange_ops: number
}

type Work = {
  def: any
  guide: Guide
  listed: Record<string, boolean>
  cmpNamespace: string | null
  wordBreaks: Record<string, string>
  routes: Route[]
  envelope: Record<string, string>
  listEnvelope: Record<string, boolean>
  envelopePaths: Record<string, string[]>
  answered: Record<string, boolean>
  sharing: {
    routes: { cmp: string, method: string, path: string, op: string }[]
    records: Record<string, boolean>
    yields: Record<string, boolean>
  }
  pathowner: Record<string, Record<string, string>>
  recordowner: Record<string, string>
  recordResources: Record<string, boolean>
  tagItems: Record<string, Record<string, Record<string, boolean>>>
  claims: Record<string, Record<string, boolean>>
  claimowner: Record<string, Record<string, string>>
  claimrecord: Record<string, string>
  entmap: Record<string, Ent>
  unresolved: number
  pathLiterals: Record<string, boolean>
  litPathCounts: Record<string, number>
  childCounts: Record<string, number>
  childKeys?: Record<string, string>
  singletons?: Record<string, string | null>
  verbRoutes: Record<string, { itemPath?: string, extended: boolean }>
  normPaths?: Record<string, string>
  itemRecords?: Record<string, { cmp: string, orig: string } | null>
  itemRecordRoutes?: Record<string, Set<string>>
}


// The weights ship beside dist as nn/guide.safetensors, read on first use.
const WEIGHTS_PATH = Path.join(__dirname, '..', '..', 'nn', 'guide.safetensors')

const GUIDE_NETS = ['probable', 'cmpKeep', 'cmpSource', 'op', 'name', 'action', 'param']

let loadedNets: Record<string, Net> | undefined = undefined

function guideNets(): Record<string, Net> {
  if (null == loadedNets) {
    const nets = loadNets(Fs.readFileSync(WEIGHTS_PATH))
    for (const name of GUIDE_NETS) {
      if (null == nets[name]) {
        throw new Error('nn: ' + WEIGHTS_PATH + ' holds no network ' + name)
      }
    }
    loadedNets = nets
  }
  return loadedNets
}


function isPathItem(key: string, pathdef: any): boolean {
  return !String(key).startsWith('x-') &&
    null != pathdef && 'object' === typeof pathdef && !Array.isArray(pathdef)
}


function isParam(part: string | undefined): boolean {
  if (null == part) {
    return false
  }
  const p = part.replace(/^\./, '').replace(/\}\.[A-Za-z0-9]+$/, '}')
  return '{' === p[0] && '}' === p[p.length - 1]
}


function getResponseSchema(response: any): any {
  return responseSchema(response)
}


function successResponse(responses: any): any {
  return responses?.[200] ?? responses?.[201] ?? responses?.[202] ?? rangeResponse(responses)
}


function successSchemas(responses: any): any[] {
  return [responses?.['200'], responses?.['201'], rangeResponse(responses)]
    .map((response) => getResponseSchema(response))
    .filter((schema) => null != schema)
}


function refSchema(def: any, xref: string): any {
  if (!xref.startsWith('#/')) {
    return undefined
  }
  let node = def
  for (const seg of xref.slice(2).split('/')) {
    const key = seg.replace(/~1/g, '/').replace(/~0/g, '~')
    node = null != node && 'object' === typeof node &&
      Object.prototype.hasOwnProperty.call(node, key) ? node[key] : undefined
  }
  return node
}


function declaresId(schema: any): boolean {
  return null != mergedProperties(schema)?.id
}


// Cloned per part, since the definition shares one object per reference.
function resolveSchemaProperties(schema: any): Record<string, any> {
  let properties: Record<string, any> = {}
  if (Array.isArray(schema.allOf)) {
    for (let i = schema.allOf.length - 1; -1 < i; --i) {
      properties = merge([properties, clone(schema.allOf[i]?.properties || {})])
    }
  }
  if (schema.properties) {
    properties = merge([properties, clone(schema.properties)])
  }
  return properties
}


function getRequestBodySchema(def: any, route: Route): any {
  return requestSchema(def, route.method, route.path) ?? route.requestBody?.schema
}


function fired(net: Net, d: Decision, unit: string): boolean {
  const i = net.layers[0].outputs.indexOf(unit)
  return -1 < i && 0 < d.hidden[i]
}


function bit(v: any): number {
  return v ? 1 : 0
}


function collectRoutes(def: any): Route[] {
  const routes: Route[] = []
  for (const [path, pdef] of sortedEntries(def.paths)) {
    if (!isPathItem(path, pdef)) {
      continue
    }
    const parts = guideParts(path)
    for (const [m, mdef] of sortedEntries(pdef)) {
      const method = m.toUpperCase()
      if (null == METHOD_CONSIDER_ORDER[method] ||
        null == mdef || 'object' !== typeof mdef || Array.isArray(mdef)) {
        continue
      }
      routes.push({
        path,
        method,
        parts,
        pm: matchEntityPath(parts),
        operationId: mdef.operationId,
        tags: Array.isArray(mdef.tags) ? mdef.tags : [],
        responses: mdef.responses,
        requestBody: mdef.requestBody,
        security: mdef.security,
        deprecated: true === mdef.deprecated,
        why_op: [],
        cmp: null,
        why_cmp: [],
      })
    }
  }

  // Parents resolve before their children whatever the keys are called.
  const byPath = (a: Route, b: Route) => {
    const an = normalizeParams(a.path)
    const bn = normalizeParams(b.path)
    return an < bn ? -1 : an > bn ? 1 : a.path < b.path ? -1 : a.path > b.path ? 1 : 0
  }
  routes.sort((a, b) => byPath(a, b) ||
    METHOD_CONSIDER_ORDER[a.method] - METHOD_CONSIDER_ORDER[b.method])

  return routes
}


function measureMetrics(work: Work) {
  const metrics = work.guide.metrics
  const def = work.def

  for (const [path, pathdef] of sortedEntries(def.paths)) {
    if (!isPathItem(path, pathdef)) {
      continue
    }
    metrics.count.path++
    for (const method of ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'query']) {
      metrics.count.method += pathdef[method] ? 1 : 0
    }
    for (const key of sortedKeys(pathdef)) {
      const tags = pathdef[key]?.tags
      if (!Array.isArray(tags)) {
        continue
      }
      for (const tag of tags) {
        if ('string' === typeof tag && 0 < tag.length && !metrics.found.tag[tag]) {
          metrics.count.tag++
          metrics.found.tag[tag] = { name: tag, canon: literalName(tag) } as any
        }
      }
    }
    // As the heuristic reads literals: an element holding a placeholder, whole
    // or beside other text, names no component.
    for (const part of guideParts(path)) {
      if ('' !== part && '{' !== part[0]) {
        work.pathLiterals[literalName(part)] = true
      }
    }
  }

  const counts = countRefs(def)
  for (const xref of Object.keys(counts).sort(byCodePoint)) {
    const m = xref.match(/\/(components\/schemas|definitions)\/(.+)$/)
    if (null == m) {
      continue
    }
    const name = canonizeCmpName(m[2])
    if (null == metrics.count.origcmprefs[name]) {
      metrics.count.cmp++
      metrics.count.origcmprefs[name] = 0
    }
    metrics.count.origcmprefs[name] = satAdd(metrics.count.origcmprefs[name], counts[xref])
    if (null == metrics.found.cmp[name]) {
      metrics.found.cmp[name] = { orig: m[2] } as any
    }
  }
}


function opFeatures(route: Route, listed?: Record<string, boolean>): Vec {
  const x: Vec = {}
  x[METHOD_FEATURES[route.method]] = 1
  const pm = route.pm
  const anchored = null != pm && pm.expr.endsWith('p/')
  x.end_param_anchored = bit(anchored)
  x.end_param_bare = bit(null != pm && !anchored && pm.expr.endsWith('p'))
  const schema = getResponseSchema(successResponse(route.responses))
  if (null != schema) {
    x.res_array = bit('array' === schema.type)
    const props = resolveSchemaProperties(schema)
    x.res_array_prop = bit(Object.values(props).some((prop: any) => 'array' === prop?.type))
  }
  x.view = bit(true === route.view_on_parent || true === route.singleton)
  x.post_read = bit(true === route.post_read)
  // A page of records a trailing parameter filters; naming reads it as a key.
  x.end_page = bit(anchored && null != listed && answersPage(schema) &&
    true !== listed[schema?.['x-ref']])
  return x
}


function resolveOp(route: Route, listed?: Record<string, boolean>) {
  const d = decide(guideNets().op, opFeatures(route, listed))
  route.op = d.cls
  route.why_op = [explain('op', d)]
}


function measureEnvelope(work: Work) {
  for (const route of work.routes) {
    const opname = route.op
    const unwrapref = null != singletonOf({ def: work.def, work }, route.path) ? null :
      getResponseSchema(successResponse(route.responses))?.['x-ref']
    for (const schema of successSchemas(route.responses)) {
      const xref = schema['x-ref']
      if (null == xref) {
        continue
      }
      const itemref = null == opname || xref !== unwrapref ? null :
        envelopeItemRef(schema, opname)
      work.envelope[xref] = '' === work.envelope[xref] || null == itemref ? '' : itemref
      work.listEnvelope[xref] = 'list' === opname
      ;(work.envelopePaths[xref] = work.envelopePaths[xref] ?? []).push(route.path)
    }
  }

  const carriers: Record<string, string[]> = Object.create(null)
  for (const xref of Object.keys(work.envelope)) {
    if ('' !== work.envelope[xref]) {
      (carriers[work.envelope[xref]] = carriers[work.envelope[xref]] ?? []).push(xref)
    }
  }
  for (const xrefs of Object.values(carriers)) {
    if (1 < xrefs.length && !isPageAndItsItem(work, xrefs)) {
      xrefs.forEach((xref) => work.envelope[xref] = '')
    }
  }

  work.answered = answeredRefs(work.def, work.envelope)
}


function isPageAndItsItem(work: Work, xrefs: string[]): boolean {
  const pages = xrefs.filter((xref) => work.listEnvelope[xref])
  const items = xrefs.filter((xref) => !work.listEnvelope[xref])
  if (1 !== pages.length || 1 !== items.length) {
    return false
  }
  const shape = (path: string) => path.replace(/\{[^}]+\}/g, '{}').replace(/\/+$/, '') || '/'
  const under = work.envelopePaths[pages[0]].map(shape)
  return work.envelopePaths[items[0]].map(shape).some((path: string) =>
    under.some((page: string) => path === page || path.startsWith(page + '/')))
}


function potentialRefs(work: Work, route: Route, why: string[]): string[] {
  const xrefs: string[] = []
  for (const schema of namingSchemas(route.method, route.responses, work.answered, work.envelope)) {
    const ref = namingRef(schema, work.envelope)
    if (null != ref) {
      if (null != schema['x-ref'] && ref !== schema['x-ref']) {
        why.push('envelope=' + cmpRefName(schema['x-ref']))
      }
      xrefs.push(ref)
    }
  }
  return xrefs
}


function measureSharing(work: Work) {
  const sharing = work.sharing
  for (const route of work.routes) {
    for (const xref of potentialRefs(work, route, [])) {
      const m = xref.match(/\/(components\/schemas|definitions)\/(.+)$/)
      if (null == m) {
        continue
      }
      const cmp = canonizeCmpName(m[2])
      const record = declaresId(refSchema(work.def, xref))
      sharing.routes.push({ cmp, method: route.method, path: route.path, op: route.op ?? '' })
      sharing.records[cmp] = true === sharing.records[cmp] || record
      const resource = pathResource(route.parts, route.method)
      if (record && null != resource) {
        work.recordResources[resource] = true
      }
    }
  }
  const records = Object.keys(sharing.records).filter((cmp) => sharing.records[cmp])
  for (const key of sharedRoutes(sharing.routes, records)) {
    sharing.yields[key] = true
  }
}


function infrequent(metrics: Guide['metrics'], origcmpref: string): boolean {
  const cmprefs = metrics.count.origcmprefs[origcmpref] ?? 0
  const mcount = metrics.count.method
  const pcount = metrics.count.path
  const method_rate = 0 < mcount ? cmprefs / mcount : -1
  const path_rate = 0 < pcount ? cmprefs / pcount : -1
  return method_rate < IS_ENTCMP_METHOD_RATE || path_rate < IS_ENTCMP_PATH_RATE
}


function resolveCmp(work: Work, route: Route) {
  const metrics = work.guide.metrics
  const why: string[] = []
  const lowerpath = route.path.toLowerCase()

  const cmpxrefs = potentialRefs(work, route, why)
    .filter((val) => val.includes('schema') || val.includes('definitions'))
    .map((val) => {
      const m = val.match(/\/components\/schemas\/(.+)$/) ?? val.match(/\/definitions\/(.+)$/)
      const origcmpref = null == m ? null : canonizeCmpName(m[1])
      return { val, origcmp: null == m ? '' : m[1], origcmpref, cmp: origcmpref ?? '' }
    })
    .filter((xref) => null != xref.origcmpref && !xref.val.includes('Meta'))

  for (const xref of cmpxrefs) {
    xref.cmp = cleanCmp({ guide: work.guide, work }, xref.cmp)
  }
  const unwrapped = cmpxrefs.flatMap((xref) => unwrapCmp(metrics, xref, why))

  const kept = unwrapped.filter((xref) => {
    const d = decide(guideNets().cmpKeep, {
      single: bit(unwrapped.length <= 1),
      in_path: bit(lowerpath.includes('/' + xref.cmp + '/')),
      occurs: bit(route.parts.some((p) => '{' !== p[0] && literalName(p.toLowerCase()) === xref.cmp)),
      infrequent: bit(infrequent(metrics, xref.origcmpref as string)),
    })
    why.push(explain('cmp:' + xref.cmp, d))
    return 'KEEP' === d.cls
  })

  const fcmp = kept[0]

  const ftag = route.tags.find((tag: string) => {
    const canon = (metrics.found.tag[tag] as any)?.canon
    return null != canon && (!!metrics.found.cmp[canon] || null == fcmp)
  })
  const tagcanon: string | null = null == ftag ? null : (metrics.found.tag[ftag] as any).canon

  const d = decide(guideNets().cmpSource, {
    cmp_avail: bit(null != fcmp),
    tag_avail: bit(null != tagcanon),
    tag_is_cmp: bit(null != tagcanon && !!metrics.found.cmp[tagcanon]),
    tag_in_path: bit(null != ftag &&
      (route.path.includes('/' + ftag + '/') || route.path.includes('/' + tagcanon + '/'))),
    tag_eq_cmp: bit(null != fcmp && null != tagcanon && fcmp.cmp === tagcanon),
  })
  why.push(explain('source', d))

  let out: Cmp | null = null
  if ('CMP' === d.cls && null != fcmp) {
    out = {
      ref: fcmp.val, cmp: fcmp.cmp, origcmp: fcmp.origcmp, origcmpref: fcmp.origcmpref,
      cmpoccur: 0, path_rate: 0, method_rate: 0,
    }
  }
  else if ('TAG' === d.cls && null != ftag && null != tagcanon) {
    out = {
      ref: 'tag', cmp: tagcanon, origcmp: ftag, origcmpref: null,
      cmpoccur: 0, path_rate: 0, method_rate: 0,
    }
    if (null != fcmp) {
      out.rescmp = fcmp.cmp
      out.rescmpoccur = metrics.count.origcmprefs[fcmp.origcmpref ?? ''] ?? 0
    }
  }

  if (null != out) {
    out.cmpoccur = metrics.count.origcmprefs[out.origcmpref ?? ''] ?? 0
    out.path_rate = 0 === metrics.count.path ? -1 : out.cmpoccur / metrics.count.path
    out.method_rate = 0 === metrics.count.method ? -1 : out.cmpoccur / metrics.count.method
  }

  route.cmp = out
  route.why_cmp = why
}


function probableFeatures(work: Work, route: Route, pm: PathMatch): Vec {
  const x: Vec = {}
  x[METHOD_FEATURES[route.method]] = 1
  const response = route.responses?.['201'] || route.responses?.['200'] ||
    rangeResponse(route.responses)
  const resSchema = getResponseSchema(response)
  x.nores = bit(null == resSchema && null != route.responses?.['204'])
  x.has_body = bit(null != getRequestBodySchema(work.def, route))
  x.ends_p_slash = bit(pm.expr.endsWith('/p/'))
  // Only the POST gate reads it, and it scans every path.
  if ('POST' === route.method && 1 === x.has_body && 0 === x.ends_p_slash) {
    x.lit_in_other_paths = bit(1 < litPathCount(work, pm[pm.length - 1]))
  }
  return x
}


function litPathCount(work: Work, lit: string): number {
  let count = work.litPathCounts[lit]
  if (null == count) {
    const needle = '/' + lit + '/'
    count = Object.keys(work.def.paths ?? {}).filter((path) => path.includes(needle)).length
    work.litPathCounts[lit] = count
  }
  return count
}


function childPathCount(work: Work, path: string): number {
  let count = work.childCounts[path]
  if (null == count) {
    count = findPathsWithPrefix({ def: work.def }, path, { strict: true })
    work.childCounts[path] = count
  }
  return count
}


// The item route a verb path hangs off, and whether any path extends the
// verb, compared with parameters normalised.
function verbRoute(work: Work, path: string): { itemPath?: string, extended: boolean } {
  let found = work.verbRoutes[path]
  if (null == found) {
    const normalize = (p: string) => p.replace(/\{[^}]+\}/g, '{}')
    const itemNorm = normalize(path.replace(/\/[^/]+$/, ''))
    const prefix = normalize(path) + '/'
    found = { extended: false }
    for (const p of Object.keys(work.def.paths ?? {})) {
      const pn = normalize(p)
      if (pn === itemNorm) {
        found.itemPath = p
      }
      else if (pn.startsWith(prefix)) {
        found.extended = true
      }
    }
    work.verbRoutes[path] = found
  }
  return found
}


// A wrapper names the component it wraps, or nothing: the candidate is
// replaced or dropped.
function unwrapCmp<T extends { cmp: string, origcmp: string, val?: string, origcmpref?: string | null }>(
  metrics: Guide['metrics'],
  xref: T,
  why: string[],
): T[] {
  const inner = wrapperOf(xref.cmp, Object.keys(metrics.found.cmp).sort())
  if (null == inner) {
    return [xref]
  }
  why.push('wrapper=' + xref.cmp + ('' === inner ? '' : '>' + inner))
  if ('' === inner) {
    return []
  }
  const orig = (metrics.found.cmp[inner] as any)?.orig ?? inner
  const out = { ...xref, cmp: inner, origcmp: orig }
  if (null != xref.val) {
    out.val = xref.val.replace(/[^/]+$/, orig)
  }
  if (null != xref.origcmpref) {
    out.origcmpref = inner
  }
  return [out]
}


// Every component a response of any of the path's methods names.
function uniqueResponseCmps(work: Work, path: string, why: string[]): { cmp: string, origcmp: string }[] {
  const names = new Set<string>()
  for (const mdef of Object.values(work.def.paths?.[path] ?? {}) as any[]) {
    for (const found of find(mdef?.responses, 'x-ref')) {
      const m = String(found.val).match(/\/(components\/schemas|definitions)\/(.+)$/)
      if (null != m) {
        names.add(m[2])
      }
    }
  }
  return Array.from(names).map((n) => ({ cmp: canonizeCmpName(n), origcmp: n }))
    .flatMap((found) => unwrapCmp(work.guide.metrics, found, why))
}


// The collection of an item route whose method its tag alone names, when the
// route answers nothing.
function tagItemCollection(work: Work, route: Route): string | null {
  const cmp = route.cmp
  if (null == cmp || 'tag' !== cmp.ref || null != cmp.rescmp) {
    return null
  }
  const parts = route.parts
  const lits = parts.slice(0, parts.findIndex(isParam))
  if (0 === lits.length || !parts.slice(lits.length).every(isParam)) {
    return null
  }
  const answers = Object.entries(work.def?.paths?.[route.path] ?? {})
    .some(([method, mdef]: [string, any]) =>
      null != METHOD_CONSIDER_ORDER[method.toUpperCase()] &&
      null != getResponseSchema(successResponse(mdef?.responses)))
  return answers ? null : '/' + lits.join('/')
}


function measureTagItems(work: Work, route: Route) {
  const collection = tagItemCollection(work, route)
  if (null == collection) {
    return
  }
  const cmp = (route.cmp as Cmp).cmp
  const items = work.tagItems[cmp] = work.tagItems[cmp] ?? {}
  items[collection] = items[collection] ?? {}
  items[collection][route.parts.filter(isParam)
    .map((part) => canonizeParam(paramOf(part))).sort().join(',')] = true
}


function pathReads(pathdef: any): boolean {
  return Object.entries(pathdef ?? {}).some(([method, mdef]: [string, any]) =>
    'GET' === method.toUpperCase() && null != mdef)
}


// Two of a tag's collections whose item routes take the same parameters, or
// that are both read, would share a selector on the tag's entity.
function tagCollides(def: any, items: Record<string, Record<string, boolean>>): boolean {
  const seen: Record<string, boolean> = Object.create(null)
  let reads = 0
  for (const [collection, params] of Object.entries(items)) {
    for (const key of Object.keys(params)) {
      if (seen[key]) {
        return true
      }
      seen[key] = true
    }
    if (pathReads(def.paths?.[collection]) || pathReads(def.paths?.[collection + '/'])) {
      reads++
    }
  }
  return 1 < reads
}


function outsideCollection(path: string, collection: string): boolean {
  if (!(guidePath(path) + '/').startsWith(collection + '/')) {
    return true
  }
  const parts = guideParts(path)
  const first = parts.findIndex(isParam)
  return -1 < first && collection !== '/' + parts.slice(0, first).join('/')
}


function keyHeld(
  work: Work,
  keys: string[],
  collection: string,
  exempt?: (path: string) => boolean,
): boolean {
  return keys.some((key) => [work.entmap[key]?.path, work.claims[key]]
    .some((paths: Record<string, any> | undefined) =>
      Object.keys(paths ?? {}).some((path) =>
        outsideCollection(path, collection) && true !== exempt?.(path))))
}


function segmentHeld(
  work: Work,
  name: string,
  collection: string,
  exempt?: (path: string) => boolean,
): boolean {
  return keyHeld(work, [name, ensureMinEntityName(name, {}),
    ensureMinEntityName(name, work.entmap)], collection, exempt)
}


function tagNamesRoute(work: Work, path: string, cmp: string): boolean {
  const methods = work.routes.filter((r) => path === r.path)
  return 0 < methods.length && methods.every((r) =>
    'tag' === r.cmp?.ref && cmp === r.cmp.cmp && null == tagItemCollection(work, r))
}


// The name an item route takes from its collection's last segment: the
// segment, the tag before it, or a number after the stored form.
function itemSegmentName(work: Work, route: Route, collection: string): { name: string, stored: boolean } {
  const cmp = (route.cmp as Cmp).cmp
  const segment = literalName(collection.substring(collection.lastIndexOf('/') + 1))
  const own = segment === cmp
  const tagged = own ? segment : cmp + '_' + segment
  const tagOwn = own ? (path: string) => tagNamesRoute(work, path, cmp) : undefined
  for (const name of own ? [segment] : [segment, tagged]) {
    if (!segmentHeld(work, name, collection, name === segment ? tagOwn : undefined)) {
      return { name, stored: false }
    }
  }
  const stored = ensureMinEntityName(tagged, {})
  let i = 2
  while (keyHeld(work, [stored + i], collection)) {
    i++
  }
  return { name: stored + i, stored: true }
}


function markRecordOwner(
  recordowner: Record<string, string>,
  route: Route,
  entname: string,
) {
  const cmp = route.cmp
  const last = route.parts.filter((part) => !isParam(part)).pop()
  if (null == recordowner[route.path] && null != cmp && 'tag' !== cmp.ref && '' !== cmp.ref &&
    entname === cmp.cmp && null != last && entname === literalName(last)) {
    recordowner[route.path] = entname
  }
}


function samePathOwner(work: Work, route: Route): { entname: string, method: string } | null {
  const owner = work.pathowner[route.path]
  if (null == owner || 'tag' !== route.cmp?.ref) {
    return null
  }
  for (const method of ['GET', 'QUERY', 'PUT', 'PATCH']) {
    const entname = owner[method]
    const read = work.routes.find((r) => r.path === route.path && r.method === method)
    if (null != entname && (read?.tags ?? []).some((tag: string) => route.tags.includes(tag))) {
      return { entname, method }
    }
  }
  return null
}


type NameSources = Record<string, string | null>


// Owners and record owners are the claims maps in the dry run that measures
// claims, and the resolved maps in the naming pass.
function nameFeatures(
  work: Work,
  route: Route,
  owners: Record<string, Record<string, string>>,
  recordowner: Record<string, string>,
  why: string[],
): {
  x: Vec, sources: NameSources, collection: string | null, viewAction: string | null,
  verbAction: string | null, recordShared: boolean, actions: Record<string, string>,
} {
  const def = work.def
  const metrics = work.guide.metrics
  const pm = route.pm
  const cmp = route.cmp
  const x: Vec = {}
  const sources: NameSources = {}

  const collection = tagItemCollection(work, route)
  x.tag_item_route = bit(null != collection)
  if (null != collection && null != cmp) {
    x.tag_cmp_is_record = bit(true === work.recordResources[cmp.cmp])
    const record = recordowner[collection] ?? recordowner[collection + '/']
    x.collrec_avail = bit(null != record)
    sources.COLLREC = record ?? null
    x.tag_collides = bit(tagCollides(def, work.tagItems[cmp.cmp] ?? {}))
  }

  const shaped = null != pm
  x.shaped = bit(shaped)
  x.m_delete = bit('DELETE' === route.method)
  x.m_write = bit(!READ_METHODS.includes(route.method))
  x.cmp_avail = bit(null != cmp)
  x.cmp_from_tag = bit('tag' === cmp?.ref)

  let key = -1
  route.parts.forEach((part, i) => {
    if (isParam(part)) {
      key = i
    }
  })

  const verb = verbOfItem({ def, work }, route, route.parts, owners)
  x.verb_avail = bit(null != verb)
  sources.VERB = verb?.parent ?? null
  const verbAction = verb?.action ?? null

  // The routes a path names before its shape does, each a parent with the
  // action that selects the route.
  const actions: Record<string, string> = {}
  const data = { def, guide: work.guide, work }
  const early: [string, { parent: string, action: string } | null][] = [
    ['LINK', relationshipOf(data, route.parts, owners)],
    ['SUBWRITE', subWriteOfItem(data, route, route.parts, owners)],
    ['VARIANT', variantOfCollection(data, route, route.parts, owners)],
    ['KEYNOUN', keyNounOf(data, route, route.parts)],
    ['ASYNC', asyncResultOf(data, route, route.parts)],
  ]
  for (const [cls, found] of early) {
    x[cls.toLowerCase() + '_avail'] = bit(null != found)
    sources[cls] = found?.parent ?? null
    if (null != found) {
      actions[cls] = found.action
    }
  }
  const single = singletonOf(data, route.path)
  x.single_avail = bit(null != single)
  sources.SINGLE = null == single ? null : cleanCmp(data, canonizeCmpName(cmpRefName(single)))
  const answered = 'tag' === cmp?.ref ? null : cmp?.cmp
  x.ans_avail = bit(null != answered && 3 <= answered.replace(/_/g, '').length)
  sources.ANS = 1 === x.ans_avail ? answered as string : null

  // The sources a route with no literal is named by; a short literal names
  // nothing, so such a route reads them from its parameters alone.
  const noneSources = (parts: string[]) => {
    const keys = parts.filter((part) => isParam(part) && !/version/i.test(part))
    const pnoun = 0 < keys.length ? paramNoun(paramOf(keys[0])) : ''
    x.param_avail = bit(3 <= pnoun.length)
    sources.PARAM = pnoun
    const opid = stripOperationVerb(canonize(route.operationId ?? ''))
    x.opid_avail = bit(3 <= opid.length)
    sources.OPID = opid
    const title = canonize(getResponseSchema(
      route.responses?.[200] ?? route.responses?.[201] ?? rangeResponse(route.responses))?.title ?? '')
    x.title_avail = bit(3 <= title.length)
    sources.TITLE = title
    for (let i = parts.length - 1; 0 <= i; i--) {
      if (!isParam(parts[i])) {
        const seg = literalName(parts[i])
        if (3 <= seg.length) {
          x.seg_avail = 1
          sources.SEG = seg
          break
        }
      }
    }
    if ('tag' === cmp?.ref && 3 <= cmp.cmp.length) {
      x.tag_name_avail = 1
      sources.TAG = cmp.cmp
    }
  }

  let viewAction: string | null = null
  if (0 === x.m_write) {
    if (0 <= key && key < route.parts.length - 1 && !/version/i.test(route.parts[key])) {
      x.view_key = 1
      const tail = route.parts.slice(key + 1)
      x.tail_singular = bit(tail.every((part) => {
        const lit = snakify(part)
        return '' !== lit && depluralize(lit) === lit
      }))
      const schema = getResponseSchema(successResponse(route.responses))
      const payload = responsePayload(schema)
      x.res_record = bit(payload.record || namedRecord(schema, route.parts[route.parts.length - 1]))
      x.res_scalars = bit(payload.scalars)
      // The scan over every path waits for the cheap conditions of the gates.
      if ((1 === x.tail_singular && 0 === x.res_record) || 1 === x.res_scalars) {
        x.route_not_extended = bit(0 === childPathCount(work, route.path))
        const parent = itemAbove({ def, work }, route.parts, key, owners)
        x.view_parent_avail = bit(null != parent)
        x.view_avail = bit(1 === x.route_not_extended && 1 === x.view_parent_avail)
        sources.PARENT = parent
        viewAction = tail.map(literalName).join('_')
      }
    }
  }
  x.view_fires = bit(1 === x.view_key && 1 === x.view_avail && 0 === x.verb_avail &&
    ((1 === x.tail_singular && 0 === x.res_record) || 1 === x.res_scalars))
  x.nounless = bit(null != pm && 0 === x.m_write && nounless(pm, route.parts))

  let recordShared = false
  if (null != pm) {
    x[SHAPE_FEATURES[pm.expr]] = 1
    const pathName = pathNoun(pm, route.parts, why)
    const verbish = pathName !== literalName(pm[PATH_NAME_INDEX[pm.expr]])
    sources.PATH = pathName
    x.cmp_foreign_tag = bit('tag' === cmp?.ref && cmp.cmp !== pathName &&
      !/(^|_)ids?$/.test(pathName) && !tagHolds({ def }, route.parts, route.path, cmp.cmp))
    x.m_post = bit('POST' === route.method)
    x.verbish = bit(verbish)
    x.verb_noun = bit(verbish && 'tag' !== cmp?.ref)
    if (1 === x.verb_noun && 't/p/t/' === pm.expr) {
      sources.VNOUN = itemAbove({ def, work }, route.parts, key, owners) ?? pathName
    }
    x.short_lit = bit(shortLiteral(pm))
    if (1 === x.short_lit) {
      const keyParam = keyParamOf(def, route.path, work)
      const knoun = null == keyParam || /version/i.test(keyParam) ? '' : paramNoun(keyParam)
      x.key_noun_avail = bit(3 <= knoun.length)
      sources.KEY = knoun
      noneSources(route.parts.filter(isParam))
    }
    x.lit_last = bit(LITERAL_LAST_SHAPES.includes(pm.expr))
    const last = pm[pm.length - 1]
    const lastCanon = literalName(last)
    const lit = isParam(last) ? '' : snakify(last)
    x.last_lit_singular = bit('' !== lit && depluralize(lit) === lit)
    x.last_is_cmp = bit(null != metrics.count.origcmprefs[lastCanon])

    const verbs = verbParts(route.parts)
    const lastVerb = snakify(verbs[verbs.length - 1])
    const readVerb = READ_VERBS.find((v) => lastVerb === v || lastVerb.startsWith(v + '_'))
    x.post_read = bit(1 === x.m_post && null != readVerb && !isParam(verbs[verbs.length - 1]) &&
      isListResponse(route, pm, route.path, []))
    if (1 === x.post_read) {
      const noun = lastVerb.slice((readVerb as string).length + 1)
      x.read_noun_avail = bit('' !== noun)
      sources.NOUN = '' === noun ? null : literalName(noun)
    }

    // The scans over every path and the body read wait for the cheap
    // conditions of the gates that read them.
    const parentOf = (itemPath: string | undefined) => {
      const held = null == itemPath ? {} : (owners[itemPath] ?? {})
      return held.GET ?? held.QUERY ?? (Object.values(held).sort()[0] as string | undefined) ??
        literalName(pm[pm.length - 3])
    }
    if (1 === x.m_post && 1 === x.lit_last && 1 === x.last_lit_singular && 0 === x.verbish &&
      0 === x.last_is_cmp && 0 === x.post_read) {
      const body = commandSource({ def, guide: work.guide, work }, route)?.name ?? null
      x.body_cmp_avail = bit(null != body)
      sources.BODY = body
      if (null != body) {
        x.item_beneath = bit(null != keyParamOf(def, route.path, work))
        x.same_path_record = bit(readsRecord({ def }, route.path))
        if ('t/p/t/' === pm.expr) {
          x.item_route_exists = bit(null != verbRoute(work, pm.path).itemPath)
        }
      }
    }
    if (0 === x.m_write) {
      const twin = commandTwin({ def, guide: work.guide, work }, route, pm, route.parts, [])
      x.twin_cmd_avail = bit(null != twin)
      sources.TWIN = twin
    }

    const probable = decide(guideNets().probable, probableFeatures(work, route, pm))
    x.probable = bit('YES' === probable.cls)
    why.push(explain('probable', probable))

    if (null != cmp || 1 === x.probable) {
      const record = recordOf({ def, guide: work.guide, work }, route.path)
      const wraps = null != record && record.cmp !== pathName &&
        wrapsLiteral(record.cmp, pathName) && !pathQualified(route.parts, record.cmp, pathName)
      x.record_avail = bit(null != record && record.cmp !== pathName && !wraps)
      x.record_wraps = bit(wraps)
      recordShared = true === record?.shared
      sources.REC = record?.cmp ?? null
    }

    if (null != cmp) {
      sources.CMP = cmp.cmp
      x.cmp_differs = bit(cmp.cmp !== pathName)
      x.cmp_ne_path = bit(cmp.cmp !== pathName && !cmp.cmp.startsWith(pathName))
      const unversioned = cmp.cmp.replace(/_v\d+$/, '')
      x.cmp_qualifies = bit(unversioned !== cmp.cmp && unversioned.endsWith('_' + pathName))
      sources.CMPQ = unversioned
      x.cmp_infrequent = bit(cmp.method_rate < IS_ENTCMP_METHOD_RATE ||
        cmp.path_rate < IS_ENTCMP_PATH_RATE)
      x.cmp_shared = bit(true === work.sharing.yields[cmp.origcmpref + ' ' + route.method + ' ' + route.path])
      x.cmp_in_path = bit(true === work.pathLiterals[cmp.cmp])
      x.cmp_wraps = bit('tag' !== cmp.ref && cmp.cmp !== pathName &&
        wrapsLiteral(cmp.cmp, pathName) && !pathQualified(route.parts, cmp.cmp, pathName))
      const keyParam = keyParamOf(def, route.path, work)
      x.cmp_names_key = bit(null != keyParam && canonizeParam(keyParam) === cmp.cmp)
    }
    else if ('DELETE' === route.method && 1 === x.probable) {
      const cmps = uniqueResponseCmps(work, route.path, why)
      x.delcmp_avail = bit(1 === cmps.length)
      sources.DELCMP = 1 === cmps.length ? cmps[0].cmp : null
    }

    if ('t/p/t/' === pm.expr) {
      sources.LAST = lastCanon
      sources.ACT = literalName(pm[pm.length - 3])
      sources.PART = verbish ? pathName : sources.ACT + '_' + pathName
      if (null == cmp && 1 === x.probable) {
        x.path_has_children = bit(0 < childPathCount(work, pm.path))
      }

      if (null != cmp) {
        x.cmp_occur_le1 = bit((cmp.rescmpoccur ?? cmp.cmpoccur ?? 0) <= 1)
        const c = String(cmp.rescmp ?? cmp.cmp ?? '')
        x.cmp_not_verb = bit('' !== lastCanon && c !== lastCanon && !c.endsWith('_' + lastCanon))

        if (1 === x.m_write && 1 === x.cmp_occur_le1 && 1 === x.last_lit_singular &&
          1 === x.cmp_not_verb) {
          const { itemPath, extended } = verbRoute(work, pm.path)
          x.item_route_exists = bit(null != itemPath)
          x.route_not_extended = bit(!extended)
          sources.PARENT = parentOf(itemPath)
        }
      }
    }
  }
  else {
    noneSources(route.parts)
  }

  const owner = samePathOwner(work, route)
  x.same_path_avail = bit(null != owner)
  sources.SAMEPATH = owner?.entname ?? null

  const parent = null == owner ?
    collectionOwner({ MethodEntity: { ref: route.cmp?.ref } } as any, route.parts, work) : null
  x.coll_owner_avail = bit(null != parent && parent !== (route.cmp?.cmp ?? ''))
  sources.COLLOWNER = parent

  return { x, sources, collection, viewAction, verbAction, recordShared, actions }
}


// The name each route takes by its path and component, found before any
// route is named, so an item route sees one sorting after it.
function measureClaims(work: Work, route: Route) {
  const { x, sources } = nameFeatures(work, route, work.claimowner, work.claimrecord, [])
  const d = decide(guideNets().name, { ...x, same_path_avail: 0 })
  if ('COLLREC' === d.cls || 'COLLSEG' === d.cls) {
    return
  }
  const name = sources[d.cls] ?? null
  if (null == name) {
    return
  }
  const cmp = route.cmp?.cmp ?? ''
  const claim = resplitFromCmp(name, cmp, [], work.wordBreaks)
  const stored = ensureMinEntityName(claim, {})
  for (const key of [claim, stored]) {
    const claims = work.claims[key] = work.claims[key] ?? {}
    claims[route.path] = true
  }
  const owners = work.claimowner[route.path] = work.claimowner[route.path] ?? {}
  owners[route.method] = claim
  markRecordOwner(work.claimrecord, route, stored)
}


function resolveName(work: Work, route: Route) {
  const why: string[] = [...route.why_cmp]
  const { x, sources, collection, viewAction, verbAction, recordShared, actions } =
    nameFeatures(work, route, work.pathowner, work.recordowner, why)
  const cmp = route.cmp?.cmp ?? ''

  let d = decide(guideNets().name, x)
  let entname: string | null = sources[d.cls] ?? null
  // The decision a collection or a same-path read overrides, which still
  // carries the record's action.
  const own = ['COLLREC', 'COLLSEG', 'SAMEPATH', 'COLLOWNER'].includes(d.cls) ?
    decide(guideNets().name, { ...x, same_path_avail: 0, tag_item_route: 0, coll_owner_avail: 0 }) : d
  let item: { name: string, why: string, stored: boolean } | null = null

  if ('COLLREC' === d.cls) {
    item = { name: entname as string, why: 'collection-record', stored: false }
  }
  else if ('COLLSEG' === d.cls) {
    item = { ...itemSegmentName(work, route, collection as string), why: 'collection-segment' }
  }

  // A join counts only where it changes the name the route's own shape gives.
  if ('SAMEPATH' === d.cls) {
    const own = decide(guideNets().name, { ...x, same_path_avail: 0 })
    const ownname = sources[own.cls] ?? null
    if (null != ownname && null != entname &&
      resplitFromCmp(ownname, cmp, [], work.wordBreaks) ===
      resplitFromCmp(entname, cmp, [], work.wordBreaks)) {
      d = own
      entname = ownname
    }
    else {
      route.same_path = entname ?? undefined
    }
  }

  // A collection owner renames the route; its shape keeps deciding the rest.
  const f = 'COLLOWNER' === d.cls ? decide(guideNets().name, { ...x, coll_owner_avail: 0 }) : d
  if ('PARENT' === f.cls) {
    route.verb_on_parent = route.parts[route.parts.length - 1]
    route.view_on_parent = fired(guideNets().name, f, 'view_singular') ||
      fired(guideNets().name, f, 'view_scalars')
    route.view_action = route.view_on_parent && null != viewAction ? viewAction : undefined
  }
  else if ('VERB' === f.cls) {
    route.verb_on_parent = route.parts[route.parts.length - 1]
    route.view_on_parent = 0 === x.m_write
    route.view_action = verbAction ?? undefined
  }
  else if ('VNOUN' === f.cls) {
    route.verb_on_parent = route.parts[route.parts.length - 1]
  }
  else if (null != actions[f.cls]) {
    route.verb_on_parent = route.parts[route.parts.length - 1]
    route.view_on_parent = ('LINK' === f.cls || 'KEYNOUN' === f.cls) && 0 === x.m_write
    route.view_action = actions[f.cls]
  }
  else if ('SINGLE' === f.cls) {
    route.singleton = true
  }
  if ('REC' === own.cls) {
    route.record_named = true
    if (recordShared) {
      route.collection_action = sources.PATH ?? undefined
    }
  }
  route.post_read = 1 === x.post_read

  why.push(explain('name', d))
  const why_path = why

  if (null == entname) {
    work.unresolved++
    entname = 'entity' + work.unresolved
  }

  entname = resplitFromCmp(entname, cmp, why_path, work.wordBreaks)

  if (null != item) {
    why_path.push(item.why + '=' + item.name)
    entname = item.name
  }

  const rawEntname = entname
  if (true !== item?.stored && null == work.entmap[entname]) {
    entname = ensureMinEntityName(entname, work.entmap)
  }

  const ent: Ent = work.entmap[entname] = work.entmap[entname] ?? {
    name: entname,
    longname: rawEntname,
    cmp: route.cmp?.cmp ?? null,
    origcmp: route.cmp?.origcmp ?? null,
    ref: route.cmp?.ref ?? '',
    why_path,
    path: Object.create(null),
    total_ops: 0,
    authexchange_ops: 0,
  }

  const pathdesc: EntPath = ent.path[route.path] = ent.path[route.path] ?? {
    pm: route.pm,
    why_path,
    rename: { param: {} },
    why_rename: { why_param: {} },
    action: {},
    op: {},
    ops: 0,
    deprecated_ops: 0,
  }
  pathdesc.why_path = why_path

  route.entname = entname
  work.pathowner[route.path] = work.pathowner[route.path] ?? {}
  work.pathowner[route.path][route.method] = entname
  markRecordOwner(work.recordowner, route, entname)
}


type RenameCapture = {
  rename: Record<string, string>
  why: Record<string, string[]>
}


function applyRename(
  ctx: ApiDefContext,
  path: string,
  method: string,
  capture: RenameCapture,
  oldParamName: string,
  newParamName: string,
  why: string,
) {
  if (!/^[A-Za-z_]/.test(newParamName)) {
    ctx.log.debug({
      point: 'param-rename-skip',
      path,
      param: oldParamName,
      rejected: newParamName,
      note: 'derived parameter name is not an identifier, keeping the' +
        " specification's name"
    })
    return
  }

  const otherParams = (path.match(/\{([^}]+)\}/g) || [])
    .map((seg) => paramOf(seg))
    .filter((name) => name !== oldParamName)

  const takenBy =
    Object.keys(capture.rename)
      .find((other) => other !== oldParamName && capture.rename[other] === newParamName) ??
    otherParams
      .find((other) => null == capture.rename[other] && canonize(other) === newParamName)

  if (null != takenBy) {
    ctx.log.debug({
      point: 'param-rename-collision',
      path,
      param: oldParamName,
      rejected: newParamName,
      takenBy,
      note: 'another parameter of this path already renames to ' +
        newParamName + ", keeping the specification's name"
    })
    return
  }

  const existing = capture.rename[oldParamName]
  const existingWhy = capture.why[oldParamName] = capture.why[oldParamName] ?? []

  if (null == existing) {
    capture.rename[oldParamName] = newParamName
    if (!existingWhy.includes(why)) {
      existingWhy.push(why)
    }
  }
  else if (newParamName !== existing) {
    ctx.warn({
      paramRenameCapture: capture, oldParamName, newParamName, why,
      note: 'Param rename mismatch: existing: ' +
        oldParamName + ' -> ' + existing + ' (why: ' + existing + ') ' +
        ' proposed: ' + newParamName + ' (why: ' + why + ') ' +
        'for path: ' + path + '. method: ' + method
    })
  }
}


function updateAction(
  method: string,
  oldParam: string,
  actionName: string,
  ent: Ent,
  pathdesc: EntPath,
  why: string,
) {
  if (!ent.name.endsWith(literalName(actionName)) && null == pathdesc.action[actionName]) {
    pathdesc.action[actionName] = {
      why_action: ['ent', ent.name, why, oldParam, method],
    }
  }
}


function paramFeatures(route: Route, ent: Ent, parts: string[], i: number, filtered: boolean): Vec {
  const old = paramOf(parts[i])
  const n = parts.length
  const hasParent = 0 < i && !isParam(parts[i - 1])
  const parentName = hasParent ? literalName(parts[i - 1]) : null
  const E = ent.name
  return {
    pp_shape: bit(null != pathMatch(route.path, 'p/p/')),
    last: bit(i === n - 1),
    second_last: bit(i === n - 2),
    not_last: bit(i < n - 1),
    has_parent: bit(hasParent),
    idx_gt1: bit(1 < i),
    exact_id: bit('id' === old),
    idlike: bit(old.endsWith('id') || old.endsWith('Id') || canonize(old) === parentName ||
      (old.endsWith('_number') && parentName === E)),
    parent_eq_ent: bit(parentName === E),
    ent_starts_parent: bit(hasParent && parentName !== E && E.startsWith(parentName + '_')),
    ent_ends_parent: bit(hasParent && E.endsWith('_' + parentName)),
    name_param: bit(isNameParam(old)),
    canon_eq_ent: bit(literalName(parts[i]) === E),
    snake_differs: bit(depluralize(snakify(normalizeFieldName(old))) !== old),
    parent_id_differs: bit(hasParent && parentName + '_id' !== old),
    parent_res: bit(hasParent && i === n - 2 && 'id' !== parentName && parentName !== E &&
      E.startsWith(parentName + '_') && E.endsWith(canonize(parts[i + 1]))),
    filtered: bit(filtered),
    verb_parent_ent: bit(i === n - 1 && verbAfterNoun(parts, i, E)),
  }
}


function renameParams(ctx: ApiDefContext, work: Work, route: Route, ent: Ent) {
  const pathdesc = ent.path[route.path]
  const capture: RenameCapture = {
    rename: pathdesc.rename.param,
    why: pathdesc.why_rename.why_param,
  }
  const parts = verbParts(route.parts)
  const pathdef = work.def.paths?.[route.path]
  const filtered = pathAnswersPage(pathdef, route.path, route.pm, work.listed) ||
    pathAnswersRecordMap(pathdef) || randomRoute(parts) ||
    selectorRoute(parts, pathdef, ent.name)

  for (let i = 0; i < parts.length; i++) {
    if (!isParam(parts[i])) {
      continue
    }
    const old = paramOf(parts[i])
    capture.why[old] = capture.why[old] ?? []
    const parentName = 0 < i && !isParam(parts[i - 1]) ? literalName(parts[i - 1]) : ''

    const d = decide(guideNets().param, paramFeatures(route, ent, parts, i, filtered))
    const why = explain('param', d)

    if ('ID' === d.cls) {
      const action = fired(guideNets().param, d, 'b1_action') ? 'action-not-parent' :
        fired(guideNets().param, d, 'b3_end_action') ? 'end-action' : null
      applyRename(ctx, route.path, route.method, capture, old, 'id', why)
      if (null != action) {
        updateAction(route.method, old, parts[i + 1], ent, pathdesc, action)
      }
    }
    else if ('PARENT_ID' === d.cls) {
      applyRename(ctx, route.path, route.method, capture, old, parentName + '_id', why)
    }
    else if ('SNAKE' === d.cls) {
      applyRename(ctx, route.path, route.method, capture, old,
        depluralize(snakify(normalizeFieldName(old))), why)
    }

    if (capture.rename[old] === old) {
      delete capture.rename[old]
      delete capture.why[old]
    }
  }

  // A rejected rename leaves the parameter to the snake-case pass.
  for (const part of parts) {
    if (!isParam(part)) {
      continue
    }
    const old = paramOf(part)
    const snake = depluralize(snakify(normalizeFieldName(old)))
    if (snake !== old && undefined === capture.rename[old]) {
      capture.why[old] = capture.why[old] ?? []
      applyRename(ctx, route.path, route.method, capture, old, snake, 'snake-case')
    }
  }

}


function findActions(route: Route, ent: Ent) {
  const pathdesc = ent.path[route.path]
  const parts = verbParts(route.parts)
  const cmp = route.cmp?.cmp
  const origcmp = route.cmp?.origcmp
  const n = parts.length

  const at = (k: number) => parts[n - k]
  const isEnt = (part: string | undefined) => {
    const canon = literalName(part as string)
    return canon === cmp || canon === origcmp || canon === ent.name
  }
  const last = at(1)
  const lastCanon = literalName(last)
  const l2Canon = literalName(at(2))
  const compound = l2Canon + '_' + lastCanon

  const d = decide(guideNets().action, {
    same_path: bit(null != route.same_path),
    vop_chosen: bit(null != route.verb_on_parent),
    last_verb: bit(isVerb(last)),
    view_act: bit(null != route.view_action),
    rec_named: bit(true === route.record_named),
    l2_is_ent: bit(isEnt(at(2))),
    l3_is_ent: bit(isEnt(at(3))),
    l4_is_ent: bit(isEnt(at(4))),
    l2_param: bit(isParam(at(2))),
    l3_param: bit(isParam(at(3))),
    l2_verb: bit(isVerb(at(2))),
    ent_endswith_last: bit(ent.name.endsWith(literalName(lastCanon))),
    ent_endswith_compound: bit(ent.name.endsWith(literalName(compound))),
  })
  pathdesc.why_path.push(explain('action', d))

  if ('LAST' === d.cls) {
    if (fired(guideNets().action, d, 'act_vop') || fired(guideNets().action, d, 'act_view')) {
      const name = route.view_action ?? lastCanon
      pathdesc.action[name] = pathdesc.action[name] ?? {
        why_action: ['ent', ent.name, 'verb-on-parent', last, route.method],
      }
    }
    else {
      updateAction(route.method, last, lastCanon, ent, pathdesc,
        fired(guideNets().action, d, 'act_l2') ? 'no-param' :
          fired(guideNets().action, d, 'act_l4_keys') ? 'ent-keys-2nd-last' : 'ent-param-2nd-last')
    }
  }
  else if ('COMPOUND' === d.cls) {
    updateAction(route.method, at(2) + '/' + last, 'action' === l2Canon ? lastCanon : compound,
      ent, pathdesc, 'ent-param-3rd-last')
  }

  if (null != route.collection_action) {
    pathdesc.action[route.collection_action] = pathdesc.action[route.collection_action] ?? {
      why_action: ['ent', ent.name, 'collection', route.collection_action, route.method],
    }
  }
}


function resolveOperation(work: Work, route: Route, ent: Ent) {
  const opname = route.op as string
  const pathdesc = ent.path[route.path]

  ent.total_ops++
  if (null != authExchangeOp(route, specSecuredByDefault(work.def))) {
    ent.authexchange_ops++
  }

  pathdesc.ops++
  pathdesc.deprecated_ops += route.deprecated ? 1 : 0

  const opdef = { method: route.method, why_op: route.why_op.join(';') }
  if (null == pathdesc.op[opname]) {
    pathdesc.op[opname] = opdef
  }
  else {
    pathdesc.op[route.method.toLowerCase()] = opdef
  }
}


function resolveTransform(ctx: ApiDefContext, work: Work, route: Route, ent: Ent) {
  const opname = route.op as string
  const op = ent.path[route.path].op
  const transform: Record<string, any> = { res: undefined }

  const resschema = getResponseSchema(successResponse(route.responses))
  const resprops = resschema?.properties

  const rescmp = resschema?.['x-ref']
  const named = null == rescmp || null == ent.cmp || cmpRefName(rescmp) !== ent.cmp

  const partprops = mergedProperties(resschema)
  const example = 'list' === opname ? findExampleObject(route, null) : null
  const records = 'list' === opname && null != partprops ?
    envelopeProp(partprops, opname, example) : null
  const last = String(route.path).split('/').filter((part: string) => '' !== part).pop() ?? ''
  const holdsRecord = (prop: any, key: string) => isEntityWrapperProp(prop) &&
    (null == records || true === propIsList(prop) ||
      ('' !== last && !isParam(last) && canonize(last) === canonize(key)))

  if (named && holdsRecord(partprops?.[ent.name], ent.name)) {
    transform.res = '`body.' + ent.name + '`'
  }
  else if ('list' === opname && named &&
    recordLists(partprops ?? {}).includes(pluralize(ent.name))) {
    transform.res = '`body.' + pluralize(ent.name) + '`'
  }
  else if (resprops) {
    const own = null != rescmp && [ent.cmp, ent.name].includes(cmpRefName(rescmp))
    const envelope = own ? singleEnvelope(resprops, opname) : envelopeProp(resprops, opname, example)
    if (null != envelope) {
      transform.res = '`body.' + envelope + '`'
    }
  }

  if (null == transform.res) {
    const envelope = composedEnvelopeProp(resschema, opname)
    if (null != envelope) {
      transform.res = '`body.' + envelope + '`'
    }
  }

  const itemref = resschema?.items?.['x-ref']
  if (null == transform.res && 'list' === opname &&
    (null == itemref || null == ent.cmp || cmpRefName(itemref) !== ent.cmp)) {
    const key = itemEnvelopeKey(resschema, [ent.name])
    if (null != key) {
      transform.res = itemEnvelopeTransform(key)
    }
  }

  // A singleton is read whole.
  if (true === route.singleton) {
    transform.res = undefined
  }

  if ('list' === opname) {
    warnListBody(ctx, route.method + ' ' + route.path, transform.res, partprops)

    const reads = String(transform.res ?? '').match(/^`body\.([^`.]+)`$/)?.[1]
    const page = null != reads && true === propIsList(partprops?.[reads]) ?
      pageTransform(partprops, reads) : undefined
    if (null != page) {
      transform.page = page
    }
  }

  if (!isempty(transform) && null != op[opname]) {
    op[opname].transform = transform
  }
}


function versionActions(ent: Ent) {
  const groups: Record<string, { path: string, version: number }[]> = {}
  for (const pathStr of sortedKeys(ent.path)) {
    const vm = pathStr.match(/\/v(\d+)(?=\/|$)/)
    if (null == vm) {
      continue
    }
    const key = pathStr.replace(/\/v\d+(?=\/|$)/, '/v')
    groups[key] = groups[key] ?? []
    groups[key].push({ path: pathStr, version: Number(vm[1]) })
  }

  for (const members of Object.values(groups)) {
    if (members.length < 2) {
      continue
    }
    const live = members.filter((m) => {
      const pathdesc = ent.path[m.path]
      return pathdesc.deprecated_ops < pathdesc.ops
    })
    const route = (0 < live.length ? live : members)
      .reduce((a, b) => b.version > a.version ? b : a)

    for (const m of members) {
      if (m === route) {
        continue
      }
      const pathdesc = ent.path[m.path]
      const vname = 'v' + m.version
      const why = ['ent', ent.name, 'version', vname, 'behind', route.path]
      const actions = pathdesc.action
      pathdesc.action = {}
      for (const actname of sortedKeys(actions)) {
        pathdesc.action[actname + '_' + vname] = {
          why_action: [...actions[actname].why_action, ...why],
        }
      }
      if (0 === sortedKeys(actions).length) {
        pathdesc.action[vname] = { why_action: why }
      }
    }
  }
}


function buildEntity(guide: Guide, ent: Ent) {
  guide.metrics.count.entity++

  const path: Record<string, GuidePath> = {}
  for (const pathstr of Object.keys(ent.path)) {
    const pathdesc = ent.path[pathstr]
    const param: Record<string, GuideRenameParam> = {}
    for (const key of Object.keys(pathdesc.rename.param)) {
      param[key] = {
        target: pathdesc.rename.param[key],
        why_rename: pathdesc.why_rename.why_param[key],
      }
    }
    path[pathstr] = {
      why_path: pathdesc.why_path,
      action: pathdesc.action as any,
      rename: { param },
      op: pathdesc.op,
    }
  }

  const guideEntity: GuideEntity = {
    name: ent.name,
    orig: ent.origcmp as string,
    path,
  }

  if (0 < ent.authexchange_ops && ent.authexchange_ops === ent.total_ops) {
    guideEntity.active = false
    guideEntity.why_inactive = 'auth-exchange'
  }

  guide.entity[ent.name] = guideEntity
}


function nameEntityParams(entity: GuideEntity) {
  const given: Record<string, Record<string, string>> = {}
  for (const [pathStr, guidePath] of Object.entries(entity.path ?? {})) {
    given[pathStr] = {}
    for (const [param, rename] of Object.entries(guidePath.rename?.param ?? {})) {
      given[pathStr][param] = rename.target
    }
  }

  const named = entityParamNames(given)

  for (const [pathStr, guidePath] of Object.entries(entity.path ?? {})) {
    guidePath.rename = guidePath.rename ?? { param: {} }
    const renames = guidePath.rename.param = guidePath.rename.param ?? {}
    for (const param of Object.keys(renames)) {
      if (null == named[pathStr][param]) {
        delete renames[param]
      }
    }
    for (const [param, target] of Object.entries(named[pathStr])) {
      if (target !== renames[param]?.target) {
        renames[param] = { target, why_rename: ['entity-param'] }
      }
    }
  }
}


async function neural01(ctx: ApiDefContext): Promise<Guide> {
  const named = () => Object.create(null)

  const guide: Guide = {
    control: {},
    entity: named(),
    metrics: {
      count: { path: 0, field: 0, method: 0, tag: 0, cmp: 0, entity: 0, origcmprefs: named() },
      found: { tag: named(), cmp: named() },
    },
  }

  const work: Work = {
    def: ctx.def,
    guide,
    listed: listedRefs(ctx.def),
    cmpNamespace: cmpNamespace(ctx.def),
    wordBreaks: wordBreaks(ctx.def),
    routes: [],
    envelope: named(),
    listEnvelope: named(),
    envelopePaths: named(),
    answered: named(),
    sharing: { routes: [], records: named(), yields: named() },
    pathowner: named(),
    recordowner: named(),
    recordResources: named(),
    tagItems: named(),
    claims: named(),
    claimowner: named(),
    claimrecord: named(),
    entmap: named(),
    unresolved: 0,
    pathLiterals: named(),
    litPathCounts: named(),
    childCounts: named(),
    verbRoutes: named(),
  }

  measureMetrics(work)
  work.routes = collectRoutes(ctx.def)
  for (const route of work.routes) {
    resolveOp(route)
  }

  measureEnvelope(work)
  measureSharing(work)

  for (const route of work.routes) {
    resolveCmp(work, route)
    measureTagItems(work, route)
  }

  for (const route of work.routes) {
    measureClaims(work, route)
  }

  for (const route of work.routes) {
    resolveName(work, route)
    resolveOp(route, work.listed)
    const ent = work.entmap[route.entname as string]
    renameParams(ctx, work, route, ent)
    if (null == route.same_path) {
      findActions(route, ent)
    }
    resolveOperation(work, route, ent)
    resolveTransform(ctx, work, route, ent)
  }

  for (const entname of sortedKeys(work.entmap)) {
    versionActions(work.entmap[entname])
    buildEntity(guide, work.entmap[entname])
  }

  guide.metrics.count.entity -= mergeCollectionPaths(guide, ctx.log,
    (pathStr: string, methods: string[], collection: boolean) =>
      pathRecordRef(ctx.def, pathStr, methods, collection),
    (sharePath: string, shareMethods: string[], itemPath: string, itemMethods: string[]) =>
      distinctShare(ctx.def, sharePath, shareMethods, itemPath, itemMethods)).length

  guide.metrics.count.entity -= mergeFoldedEntities(guide, ctx.log).length
  guide.metrics.count.entity -= mergeCommandEntities(guide, ctx.log).length

  for (const entity of Object.values(guide.entity)) {
    nameEntityParams(entity)
  }

  let totalPaths = 0
  let totalOps = 0
  for (const entity of Object.values(guide.entity)) {
    for (const p of sortedKeys(entity.path ?? {})) {
      totalPaths++
      totalOps += sortedKeys(entity.path[p].op ?? {}).length
    }
  }

  ctx.log.info({
    point: 'neural01',
    note: `entities=${Object.keys(guide.entity).length} paths=${guide.metrics.count.path}` +
      ` methods=${guide.metrics.count.method} tags=${guide.metrics.count.tag}` +
      ` cmps=${guide.metrics.count.cmp}` +
      ` entity-paths=${totalPaths} entity-ops=${totalOps}`,
  })

  return guide
}


export {
  neural01,
  guideNets,
  GUIDE_NETS,
}
