/* Copyright (c) 2026 Voxgig Ltd, MIT License */

import {
  fieldName, guideActive, mergedProperties, routeParams, sortedKeys,
} from '../utility'

import { byCodePoint } from '../refcount'

import {
  binaryBounds, binarySchema, requestBody, requestMedia, responseBody,
} from './body'

import type { ModelBody, ModelEntity, ModelPoint, ModelSession, ModelBinary } from '../model'
import type { GuideBinary, GuideSession } from '../types'


// Methods that carry no body of their own.
const BODILESS = ['HEAD', 'OPTIONS', 'TRACE']

type Dialect = { name: string, media: string, tell: string, headers: string[] }

// The tell is the header argument that, with the media type, marks the append.
const DIALECTS: Dialect[] = [
  {
    name: 'tus',
    media: 'application/offset+octet-stream',
    tell: 'upload-offset',
    headers: ['tus-resumable', 'upload-offset', 'upload-length', 'upload-defer-length',
      'upload-metadata', 'upload-checksum', 'upload-concat'],
  },
  {
    name: 'ietf',
    media: 'application/partial-upload',
    tell: 'upload-complete',
    headers: ['upload-complete', 'upload-incomplete', 'upload-offset', 'upload-length',
      'upload-limit', 'upload-draft-interop-version'],
  },
]


type SessionMatch = { dialect: string, active: boolean, own: string[] }


function sessionDialect(method: string, media: string[], headers: string[]): SessionMatch | undefined {
  if ('PATCH' !== String(method).toUpperCase()) {
    return undefined
  }
  const types = media.map((type) => String(type).split(';')[0].trim().toLowerCase())
  const dialect = DIALECTS.find((d) => types.includes(d.media))
  if (null == dialect) {
    return undefined
  }
  const names = headers.map((name) => String(name).toLowerCase())
  return {
    dialect: dialect.name,
    active: names.includes(dialect.tell),
    own: headers.filter((name) => dialect.headers.includes(String(name).toLowerCase()))
      .sort(byCodePoint),
  }
}


function sessionHeader(dialect: string, name: string): boolean {
  const wire = String(name).toLowerCase().replace(/_/g, '-')
  return true === DIALECTS.find((d) => d.name === dialect)?.headers.includes(wire)
}


// Undefined when no body of the route is bytes; switched off when bytes are
// only an alternative to the body the route prefers.
function binarySlot(
  def: any, pathStr: string, methods: string[], record: any, action: string,
): GuideBinary | undefined {
  const sending = methods.map((method) => String(method).toUpperCase())
    .filter((method) => !BODILESS.includes(method))
  const bodies = sending.flatMap((method) =>
    [requestBody(def, method, pathStr), responseBody(def, method, pathStr)])
    .filter((body): body is ModelBody => null != body)
  const chosen = bodies.some((body) => true === body.binary)
  if (!chosen && !bodies.some((body) => (body.alternatives ?? []).some((alt) => true === alt.binary))) {
    return undefined
  }

  const slot: GuideBinary = chosen ? {} : { active: false, why_inactive: 'binary-alternative' }

  const props = mergedProperties(record) ?? {}
  const key = sortedKeys(props).find((name: string) =>
    action === fieldName(name) && !binarySchema(props[name]))
  if (null != key) {
    slot.field = fieldName(key)
  }

  if (methods.some((method) => 'HEAD' === String(method).toUpperCase())) {
    slot.head = true
  }

  const bounds = sending.flatMap((method) => binaryBounds(def, method, pathStr))
  if (0 < bounds.length) {
    slot.max = Math.min(...bounds)
  }

  return slot
}


function pointBinary(
  method: string, rb: ModelBody | undefined, rs: ModelBody | undefined, binary: any,
): ModelBinary | undefined {
  if (null == binary || !guideActive(binary) || !(true === rb?.binary || true === rs?.binary)) {
    return undefined
  }
  const bn: ModelBinary = {}
  if ('string' === typeof binary.field && '' !== binary.field) {
    bn.field = binary.field
  }
  if (true === binary.head && 'GET' === String(method).toUpperCase()) {
    bn.head = true
  }
  if (Number.isSafeInteger(binary.max) && 0 <= binary.max) {
    bn.max = binary.max
  }
  return 0 < Object.keys(bn).length ? bn : undefined
}


// Guide stage: each action whose route moves bytes gets its binary entry.
function markFileSlots(guide: any, def: any, recordOf: (entity: any) => any) {
  for (const ename of sortedKeys(guide.entity ?? {})) {
    const entity = guide.entity[ename]
    for (const pathStr of sortedKeys(entity?.path ?? {})) {
      const gpath = entity.path[pathStr]
      const methods = Object.values(gpath?.op ?? {}).map((op: any) => String(op?.method ?? ''))
      for (const actname of sortedKeys(gpath?.action ?? {})) {
        const slot = binarySlot(def, pathStr, methods, recordOf(entity), actname)
        if (null != slot) {
          gpath.action[actname].binary = slot
        }
      }
    }
  }
}


// Guide stage: an entity whose append speaks a dialect is a session; with
// only the media type, the session is written switched off.
function markSessions(guide: any, def: any) {
  for (const ename of sortedKeys(guide.entity ?? {})) {
    const entity = guide.entity[ename]
    let found: GuideSession | undefined
    for (const pathStr of sortedKeys(entity?.path ?? {})) {
      const gpath = entity.path[pathStr]
      const pathdef = def?.paths?.[pathStr]
      for (const opname of sortedKeys(gpath?.op ?? {})) {
        const method = String(gpath.op[opname]?.method ?? '').toUpperCase()
        const opdef = pathdef?.[method.toLowerCase()]
        const headers = routeParams(pathdef, opdef)
          .filter((param: any) => 'header' === param?.in && 'string' === typeof param?.name)
          .map((param: any) => param.name)
        const match = sessionDialect(method, requestMedia(def, method, pathStr), headers)
        if (null == match || (null != found && (false !== found.active || !match.active))) {
          continue
        }
        const offset = sortedKeys(gpath.op).find((name: string) =>
          'GET' === String(gpath.op[name]?.method ?? '').toUpperCase())
        found = {
          ...(match.active ? {} : {
            active: false,
            why_inactive: 'no-' + DIALECTS.find((d) => d.name === match.dialect)!.tell,
          }),
          dialect: match.dialect,
          path: pathStr,
          append: opname,
          ...(null == offset ? {} : { offset }),
        }
      }
    }
    if (null != found) {
      entity.session = found
    }
  }
}


// The model op that holds the guide op's point on the route.
function modelOpOf(ment: ModelEntity, gpath: any, pathStr: string, gopname: unknown): string | undefined {
  if ('string' !== typeof gopname) {
    return undefined
  }
  const method = String(gpath?.op?.[gopname]?.method ?? '').toUpperCase()
  return sortedKeys(ment.op ?? {}).find((opname: string) =>
    ((ment.op as any)[opname]?.points ?? []).some((mpoint: ModelPoint) =>
      pathStr === mpoint.o && method === String(mpoint.m).toUpperCase()))
}


// The session's own headers are its runtime's to send, so they leave the
// caller's arguments, and with them the selector.
function applySession(guide: any, ment: ModelEntity) {
  const gent = guide?.entity?.[ment.name]
  const gsession = gent?.session
  if (null == gsession || !guideActive(gsession) ||
    !DIALECTS.some((d) => d.name === gsession.dialect)) {
    return
  }
  const gpath = gent.path?.[gsession.path]
  const append = modelOpOf(ment, gpath, gsession.path, gsession.append)
  if (null == append) {
    return
  }
  const offset = modelOpOf(ment, gpath, gsession.path, gsession.offset)

  const session: ModelSession = { dialect: gsession.dialect, append }
  if (null != offset) {
    session.offset = offset
  }
  const slot = gsession.slot
  if ('string' === typeof slot?.entity && 'string' === typeof slot?.action) {
    session.slot = { entity: slot.entity, action: slot.action }
  }
  ment.session = session

  for (const opname of [append, offset]) {
    for (const mpoint of ((null == opname ? undefined : (ment.op as any)[opname])?.points ?? []) as ModelPoint[]) {
      if (gsession.path !== mpoint.o) {
        continue
      }
      for (const marg of mpoint.g?.header ?? []) {
        if (sessionHeader(gsession.dialect, marg.or ?? marg.n)) {
          marg.a = false
        }
      }
    }
  }
}


export {
  applySession,
  binarySlot,
  markFileSlots,
  markSessions,
  pointBinary,
  sessionDialect,
}
