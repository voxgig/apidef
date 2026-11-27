

import { each, camelify, lcf } from 'jostraca'

import type { TransformResult, Transform } from '../transform'

import { getelem } from '@voxgig/struct'

import {
  nom,
  nonNullType,
  sortedKeys,
} from '../utility'


function isEntityIdParam(point: any, param: any, opname?: string): boolean {
  if ('id' === param?.n) return true
  const renameMap = point?.r?.param
  if (renameMap && param?.n) {
    const camel = lcf(camelify(param.n))
    if ('id' === renameMap[camel]) return true
  }
  if ('update' === opname || 'patch' === opname || 'load' === opname || 'remove' === opname) {
    const segments: any[] = point?.s || []
    let last: string | null = null
    for (const s of segments) {
      if (null != s?.var) last = s.var
    }
    if (last && last === param?.n) return true
  }
  return false
}

import { KIT } from '../types'

import type { KitModel } from '../types'

import type {
  OpName,
  GuideEntity,
} from '../types'

import type {
  ModelEntity,
  ModelEntityFlow,
  ModelEntityFlowStep,
  ModelFlowFile,
  ModelOp,
} from '../model'




const flowstepTransform: Transform = async function(
  ctx: any,
): Promise<TransformResult> {
  const { apimodel, guide } = ctx
  const kit: KitModel = apimodel.main[KIT]

  let msg = ''

  each(kit.flow, (flow: ModelEntityFlow, flowname: string) => {
    ctx.log.debug({ point: 'flowstep', note: flowname })

    const ent: ModelEntity = kit.entity[flow.entity]
    const opmap = ent.op

    const ref01 = ent.name + '_ref01'

    if ('file' === flow.kind) {
      fileSteps(opmap, flow, ent, ref01)
      msg += flowname + ' '
      return
    }

    createStep(opmap, flow, ent, { input: { ref: ref01 } })

    listStep(opmap, flow, ent,
      { valid: [{ apply: 'ItemExists', def: { ref: ref01 } }] })

    // The patch writes the update's mark, so the load reads back one mark.
    const mark01 = 'Mark01-' + ref01
    updateStep(opmap, flow, ent, markArgs(ent, opmap.update, ref01, '_up0', mark01))
    patchStep(opmap, flow, ent, markArgs(ent, opmap.patch, ref01, '_pt0', mark01))

    loadStep(opmap, flow, ent,
      {
        input: {
          ref: ref01,
          suffix: '_dt0',
          srcdatavar: ref01 + '_data'
        },
        valid: markOff(flow) ? [] : [{
          apply: 'TextFieldMark',
          def: { mark: mark01 }
        }]
      })

    // A remove runs only on the record the flow's own create made.
    const created = stepOn(flow, 'create')

    removeStep(opmap, flow, ent, {
      input: { ref: ref01, suffix: '_rm0' },
      active: created,
    })

    // The "removed item is gone" verify LIST only makes sense after a real
    // remove step, so it follows that step on or off.
    if (null != opmap.remove && null != opmap.create) {
      listStep(opmap, flow, ent, {
        input: { suffix: '_rt0' },
        valid: [{ apply: 'ItemNotExists', def: { ref: ref01 } }],
        active: stepOn(flow, 'remove'),
      })
    }

    msg += flowname + ' '
  })

  return { ok: true, msg }
}


type MakeFlowStep =
  (opmap: any, flow: ModelEntityFlow, ent: ModelEntity, args: Record<string, any>) => void



// A basic step moves a JSON record; a point whose request or response body is
// anything else waits, switched off, for steps that move files.
function newFlowStep(opname: OpName, args: Record<string, any>, point: any): ModelEntityFlowStep {
  const step: ModelEntityFlowStep = {
    o: opname,
    i: args.input ?? {},
    m: args.match ?? {},
    d: args.data ?? {},
    s: args.spec ?? [],
    v: args.valid ?? [],
  }
  if (false === args.active || !recordPoint(point)) {
    step.a = false
  }
  return step
}


function recordPoint(point: any): boolean {
  return [point?.rb, point?.rs].every((body: any) => null == body || 'json' === body.kind)
}


function stepOn(flow: ModelEntityFlow, opname: OpName): boolean {
  const step = flow.step.find((step: ModelEntityFlowStep) => opname === step.o)
  return null != step && false !== step.a
}


function stepOff(flow: ModelEntityFlow, opname: OpName): boolean {
  const step = flow.step.find((step: ModelEntityFlowStep) => opname === step.o)
  return false === step?.a
}


// The load checks no mark when the update or patch step is off and neither is on.
function markOff(flow: ModelEntityFlow): boolean {
  return (stepOff(flow, 'update') || stepOff(flow, 'patch')) &&
    !stepOn(flow, 'update') && !stepOn(flow, 'patch')
}


// A step calls the op without an action, so it reads the point that call
// reaches: the last plain point, the most generic as points sort the most
// specific first.
function plainPoint(points: any[] | undefined): any {
  const all = points ?? []
  for (let i = all.length - 1; 0 <= i; i--) {
    if (null == all[i]?.q?.$action) {
      return all[i]
    }
  }
  return getelem(all, -1)
}


// Reverse-lookup: given a point with rename.param like {spaceId: 'id'} or
// {space_id: 'id'}, return the snake_case ORIGINAL name (e.g. 'space_id') of
// any param whose URL placeholder is now `{id}`. Returns null when no
// rename-to-id is recorded — the literal `id` then represents the entity's
// own id and createStep should skip it.
function originalSnakeNameOfRenamedId(point: any): string | null {
  const renameMap = point?.r?.param || {}
  for (const [src, dst] of Object.entries(renameMap)) {
    if ('id' === dst) {
      const srcStr = String(src)
      // Already snake_case? Use as-is. Otherwise convert to snake form.
      return srcStr.includes('_') ? srcStr : (srcStr.replace(/[A-Z]/g, m => '_' + m.toLowerCase()).replace(/^_/, ''))
    }
  }
  return null
}


const createStep: MakeFlowStep = (
  opmap: any,
  flow: ModelEntityFlow,
  ent: ModelEntity,
  args: Record<string, any>
) => {
  if (null != opmap.create) {
    const point = plainPoint(opmap.create.points)
    const step = newFlowStep('create', args, point)
    fillCreateMatch(opmap, point, step, args)
    flow.step.push(step)
  }
}


function fillCreateMatch(opmap: any, point: any, step: ModelEntityFlowStep, args: Record<string, any>) {
  each(point.g.params, (param: any) => {
    if ('id' === param.n) {
      const origName = originalSnakeNameOfRenamedId(point)
      if (origName) {
        step.m[origName] = args.input?.[origName] ?? origName.replace(/_id/, '') + '01'
      }
      // If there's no rename-from, this is genuinely the entity's id — skip
      // (the create call generates it).
      return
    }
    step.m[param.n] = args.input?.[param.n] ?? param.n.replace(/_id/, '') + '01'
  })

  seedRelatedOpParams(opmap, point, step)
}


function seedRelatedOpParams(opmap: any, createPoint: any, step: ModelEntityFlowStep) {
  const otherOps = ['list', 'load', 'update', 'patch', 'remove']
  for (const opname of otherOps) {
    const op = opmap[opname]
    if (!op?.points) continue
    for (const point of op.points) {
      const params: any[] = point?.g?.params || []
      for (const param of params) {
        if (!param?.n) continue
        if (isEntityIdParam(point, param, opname as any)) continue
        if (step.m[param.n] !== undefined) continue
        if ('id' === param.n) continue
        step.m[param.n] =
          param.n.replace(/_id/, '') + '01'
      }
    }
  }
}


const listStep: MakeFlowStep = (
  opmap: any,
  flow: ModelEntityFlow,
  ent: ModelEntity,
  args: Record<string, any>
) => {
  if (null != opmap.list) {
    const point = plainPoint(opmap.list.points)
    const step = newFlowStep('list', args, point)

    each(point.g.params, (param: any) => {
      if ('id' === param.n) {
        const origName = originalSnakeNameOfRenamedId(point)
        if (origName) {
          step.m[origName] = args.input?.[origName] ?? origName.replace(/_id/, '') + '01'
        }
        return
      }
      step.m[param.n] = args.input?.[param.n] ?? param.n.replace(/_id/, '') + '01'
    })

    flow.step.push(step)
  }
}


function changeStep(opname: 'update' | 'patch'): MakeFlowStep {
  return (
    opmap: any,
    flow: ModelEntityFlow,
    ent: ModelEntity,
    args: Record<string, any>
  ) => {
    if (null != opmap[opname]) {
      const point = plainPoint(opmap[opname].points)
      const step = newFlowStep(opname, args, point)

      each(point.g.params, (param: any) => {
        if (isEntityIdParam(point, param, opname)) {
          // Entity's own id — supplied at test time via the loaded/created
          // entity's id field, not as a separate body parameter. Skip.
          return
        }
        step.d[param.n] = args.input?.[param.n] ?? param.n.replace(/_id/, '') + '01'
      })

      flow.step.push(step)
    }
  }
}


const updateStep = changeStep('update')
const patchStep = changeStep('patch')


function markArgs(
  ent: ModelEntity,
  op: ModelOp | undefined,
  ref: string,
  suffix: string,
  mark: string
): Record<string, any> {
  return {
    input: {
      ref,
      textfield: firstTextField(ent, op)?.n,
      suffix,
      srcdatavar: ref + '_data',
    },
    spec: [{
      apply: 'TextFieldMark',
      def: { mark },
    }],
  }
}


const loadStep: MakeFlowStep = (
  opmap: any,
  flow: ModelEntityFlow,
  ent: ModelEntity,
  args: Record<string, any>
) => {
  if (null != opmap.load) {
    const point = plainPoint(opmap.load.points)
    const step = newFlowStep('load', args, point)

    each(point.g.params, (param: any) => {
      if (isEntityIdParam(point, param, 'load')) {
        step.m.id = args.input?.id ?? ent.name + '01'
      }
      else {
        step.m[param.n] = args.input?.[param.n] ?? param.n.replace(/_id/, '') + '01'
      }
    })

    flow.step.push(step)
  }
}


const removeStep: MakeFlowStep = (
  opmap: any,
  flow: ModelEntityFlow,
  ent: ModelEntity,
  args: Record<string, any>
) => {
  // A REMOVE must operate on an entity the flow itself CREATEd — never on
  // pre-existing data. If the entity has no create op (e.g. merchant), emit
  // no remove step at all; a create-less remove would delete real records in
  // live mode and makes no sense as a self-contained CRUD test.
  if (null != opmap.remove && null != opmap.create) {
    const point = plainPoint(opmap.remove.points)
    const step = newFlowStep('remove', args, point)

    each(point.g.params, (param: any) => {
      if (isEntityIdParam(point, param, 'remove')) {
        step.m.id = args.input?.id ?? ent.name + '01'
      }
      else {
        step.m[param.n] = args.input?.[param.n] ?? param.n.replace(/_id/, '') + '01'
      }
    })

    flow.step.push(step)
  }
}


function firstTextField(ent: ModelEntity, op?: ModelOp) {
  const paramNames: Record<string, boolean> = {}
  each((op as any)?.points).forEach((pt: any) => {
    each(pt?.g?.params).forEach((p: any) => {
      if (p && null != p.n) {
        paramNames[p.n] = true
      }
    })
  })

  const identity = identityFields(ent)

  const fields = Object.keys(ent.fields).sort().map(n => ent.fields[n])
  for (let fI = 0; fI < fields.length; fI++) {
    const field = fields[fI]
    // NOT A readOnly FIELD, NOR A FILE. The flow writes this one and then
    // asserts the mark comes back, which a field the client may not send, or
    // one holding bytes, never does. Fields are sorted by name, so the choice
    // is alphabetical accident: solar's planet, once its spec declared the
    // server-assigned `forbidReason`, marked that instead of `kind`.
    if ('`$STRING`' === nonNullType(field.t) && true !== identity[field.n] && true !== field.ro &&
      'binary' !== field.fo && true !== paramNames[field.n]) {
      return field
    }
  }
}


// The fields holding the record's identity, which a mark would overwrite: `id`,
// the identity field, each composite part, and each record field a part is
// read from.
function identityFields(ent: ModelEntity): Record<string, boolean> {
  const out: Record<string, boolean> = { id: true }
  const id: any = ent.id
  if (null != id?.field) {
    out[id.field] = true
  }
  for (const part of (Array.isArray(id?.parts) ? id.parts : [])) {
    out[part] = true
  }
  for (const where of Object.values(id?.from ?? {})) {
    if (!String(where).includes('.')) {
      out[String(where)] = true
    }
  }
  return out
}

// Content is described, never carried; docs/reference/model.md states the rule.
const FILE_BYTES = 512
const FILE_TEXT = 192

// The ops that write a slot, in the order the generator chooses among them.
const SLOT_WRITERS: OpName[] = ['update', 'patch', 'create']

type FileWay = {
  via: 'slot' | 'body'
  action: string
  content: 'bytes' | 'text'
  read?: any
  write?: any
  writeop?: OpName
}


function fileContent(content: 'bytes' | 'text', size: number, seed: number): Uint8Array | string {
  const n = 'text' === content ? 96 : 256
  const ks = Array.from({ length: size }, (_, i) => (seed + 7 * Math.floor(i / 2)) % n)
  return 'text' === content ?
    ks.map((k) => 95 === k ? '\n' : String.fromCharCode(32 + k)).join('') :
    Uint8Array.from(ks)
}


function livePoints(opmap: any, opname: string): any[] {
  return (opmap?.[opname]?.points ?? []).filter((point: any) => false !== point?.a)
}


function actionOf(point: any): string {
  return null == point?.q?.$action ? '' : String(point.q.$action)
}


// Slots as sdkgen derives them, then the raw bodies no slot takes: text, and
// bytes the plain point sends where the entity has no unnamed slot.
function fileWays(ent: ModelEntity): FileWay[] {
  const opmap: any = ent.op ?? {}
  const slots: Record<string, FileWay> = {}
  const bodies: Record<string, FileWay> = {}
  const way = (into: Record<string, FileWay>, via: FileWay['via'], action: string,
    content: FileWay['content']) => (into[action] = into[action] ?? { via, action, content })

  for (const point of livePoints(opmap, 'load')) {
    if ('raw' !== point?.rs?.kind) continue
    const action = actionOf(point)
    const found = true === point.rs.binary ?
      way(slots, 'slot', action, 'bytes') : way(bodies, 'body', action, 'text')
    found.read = found.read ?? point
  }

  for (const opname of SLOT_WRITERS) {
    for (const point of livePoints(opmap, opname)) {
      if ('raw' !== point?.rb?.kind) continue
      const action = actionOf(point)
      const binary = true === point.rb.binary
      const found = binary && ('' !== action || null != slots['']) ?
        way(slots, 'slot', action, 'bytes') :
        way(bodies, 'body', action, binary ? 'bytes' : 'text')
      if (null == found.write) {
        found.write = point
        found.writeop = opname
        found.content = binary ? 'bytes' : found.content
      }
    }
  }

  return [
    ...sortedKeys(slots).map((action) => slots[action]),
    ...sortedKeys(bodies).map((action) => bodies[action]),
  ]
}


function binaryFields(point: any): string[] {
  const body = point?.rb
  if ('multipart' !== body?.kind && 'form' !== body?.kind) return []
  return (body.fields ?? []).filter((field: any) => true === field?.binary)
    .map((field: any) => String(field.name))
}


// The points other than the plain create whose multipart or form body carries a file.
function fieldPoints(opmap: any, create: any): { opname: OpName, point: any }[] {
  return SLOT_WRITERS.flatMap((opname) => livePoints(opmap, opname)
    .filter((point) => point !== create && 0 < binaryFields(point).length)
    .map((point) => ({ opname, point })))
}


// A file flow exercises what moves bytes or text; a session's append is its dialect's.
function hasFileSteps(ent: ModelEntity): boolean {
  if (null != ent.session) return false
  const opmap: any = ent.op ?? {}
  const create = null == opmap.create ? undefined : plainPoint(opmap.create.points)
  return 0 < fileWays(ent).length || 0 < fieldPoints(opmap, create).length ||
    (null != create && false !== create.a && 0 < binaryFields(create).length)
}


// Create the record, move each file and text body in and out of it, remove it.
// A write needs the record the flow created; a read without a write before it
// checks only that content arrives.
function fileSteps(opmap: any, flow: ModelEntityFlow, ent: ModelEntity, ref: string) {
  const ways = fileWays(ent)
  let seed = 0
  let tf = 0

  // A transfer names the record as its own operation does.
  const transfer = (opname: OpName, point: any, f: ModelFlowFile[], on: boolean) => {
    const step: ModelEntityFlowStep = {
      o: opname, i: { ref, suffix: '_tf' + (tf++) }, m: {}, d: {}, s: [], v: [], f,
    }
    each(point.g?.params, (param: any) => {
      if (isEntityIdParam(point, param, opname)) {
        step.m.id = ent.name + '01'
      }
      else {
        step.m[param.n] = param.n.replace(/_id/, '') + '01'
      }
    })
    if (!on) step.a = false
    flow.step.push(step)
  }

  const put = (via: ModelFlowFile['via'], action: string, content: ModelFlowFile['content'],
    size: number, field?: string): ModelFlowFile => ({
      via, action, ...(null == field ? {} : { field }), dir: 'put', content, size, seed: ++seed,
    })

  // A read compares with what the flow wrote, when it wrote content of that kind.
  const get = (way: FileWay, written?: ModelFlowFile) => {
    const content = 'slot' === way.via ? 'bytes' : 'text'
    transfer('load', way.read, [{
      via: way.via, action: way.action, dir: 'get', content,
      ...(content !== written?.content ? {} : { size: written.size, seed: written.seed }),
    }], true)
  }

  const sizeOf = (point: any, content: FileWay['content']) => {
    const max = point?.bn?.max
    const size = 'text' === content ? FILE_TEXT : FILE_BYTES
    return Number.isSafeInteger(max) && 0 <= max && max < size ? max : size
  }

  const slotRead = (name: string) =>
    ways.find((way) => 'slot' === way.via && name === way.action && null != way.read)

  let created = false
  const create = null == opmap.create ? undefined : plainPoint(opmap.create.points)
  const atCreate = ways.find((way) => null != create && create === way.write)

  if (null != create) {
    // An action is no plain create: the flow cannot make its record with one.
    const action = actionOf(create)
    created = '' === action && (null == create.rs || 'json' === create.rs.kind)
    const step: ModelEntityFlowStep = { o: 'create', i: { ref }, m: {}, d: {}, s: [], v: [] }
    fillCreateMatch(opmap, create, step, {})

    // The create's own raw body, whichever point its way prefers as writer.
    const binary = true === create.rb?.binary
    const own = 'raw' !== create.rb?.kind ? undefined : ways.find((way) => action === way.action &&
      way.via === (binary && ('' !== action || null != slotRead('')) ? 'slot' : 'body'))
    const content = binary ? 'bytes' : 'text'
    const f = null != own ? [put(own.via, action, content, sizeOf(create, content))] :
      binaryFields(create).map((field) => put('field', action, 'bytes', FILE_BYTES, field))
    if (0 < f.length) step.f = f
    if (!created || f.some((file) => (file.size ?? 0) < 1)) step.a = false
    created = created && false !== step.a
    flow.step.push(step)

    for (const file of f) {
      const way = null != own ? (null == own.read ? undefined : own) : slotRead(file.field as string)
      if (null != way) get(way, created ? file : undefined)
    }
  }

  for (const { opname, point } of fieldPoints(opmap, create)) {
    const f = binaryFields(point).map((field) => put('field', actionOf(point), 'bytes', FILE_BYTES, field))
    transfer(opname, point, f, created)
    for (const file of f) {
      const way = slotRead(file.field as string)
      if (null != way) get(way, created ? file : undefined)
    }
  }

  for (const way of ways) {
    if (way === atCreate) continue
    let written: ModelFlowFile | undefined
    if (null != way.write) {
      const file = put(way.via, way.action, way.content, sizeOf(way.write, way.content))
      const on = created && 0 < (file.size ?? 0)
      transfer(way.writeop as OpName, way.write, [file], on)
      written = on ? file : undefined
    }
    if (null != way.read) get(way, written)
  }

  if (null != opmap.create) {
    removeStep(opmap, flow, ent, { input: { ref, suffix: '_rm0' }, active: created })
  }
}


export {
  fileContent,
  flowstepTransform,
  hasFileSteps,
}

