

import { each, camelify, lcf } from 'jostraca'

import type { TransformResult, Transform } from '../transform'

import { getelem } from '@voxgig/struct'

import {
  nom,
} from '../utility'


function isEntityIdParam(point: any, param: any, opname?: string): boolean {
  if ('id' === param?.name) return true
  const renameMap = point?.rename?.param
  if (renameMap && param?.name) {
    const camel = lcf(camelify(param.name))
    if ('id' === renameMap[camel]) return true
  }
  if ('update' === opname || 'load' === opname || 'remove' === opname) {
    const segments: any[] = point?.segments || []
    let last: string | null = null
    for (const s of segments) {
      if (null != s?.var) last = s.var
    }
    if (last && last === param?.name) return true
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

    createStep(opmap, flow, ent, { input: { ref: ref01 } })

    listStep(opmap, flow, ent,
      { valid: [{ apply: 'ItemExists', def: { ref: ref01 } }] })

    const mark01 = 'Mark01-' + ref01
    const firsttf = firstTextField(ent, opmap.update)
    updateStep(opmap, flow, ent,
      {
        input: {
          ref: ref01,
          textfield: firsttf?.name,
          suffix: '_up0',
          srcdatavar: ref01 + '_data'
        },
        spec: [{
          apply: 'TextFieldMark',
          def: { mark: mark01 }
        }]
      })

    loadStep(opmap, flow, ent,
      {
        input: {
          ref: ref01,
          suffix: '_dt0',
          srcdatavar: ref01 + '_data'
        },
        valid: [{
          apply: 'TextFieldMark',
          def: { mark: mark01 }
        }]
      })

    removeStep(opmap, flow, ent, {
      input: { ref: ref01, suffix: '_rm0' }
    })

    // The "removed item is gone" verify LIST only makes sense after a real
    // remove step, which is now gated on create. Gate the verify on create
    // too, so create-less flows stay read-only.
    if (null != opmap.remove && null != opmap.create) {
      listStep(opmap, flow, ent, {
        input: { suffix: '_rt0' },
        valid: [{ apply: 'ItemNotExists', def: { ref: ref01 } }]
      })
    }

    msg += flowname + ' '
  })

  return { ok: true, msg }
}


type MakeFlowStep =
  (opmap: any, flow: ModelEntityFlow, ent: ModelEntity, args: Record<string, any>) => void



function newFlowStep(opname: OpName, args: Record<string, any>): ModelEntityFlowStep {
  return {
    op: opname,
    input: args.input ?? {},
    match: args.match ?? {},
    data: args.data ?? {},
    spec: args.spec ?? [],
    valid: args.valid ?? [],
  }
}


// Reverse-lookup: given a point with rename.param like {spaceId: 'id'} or
// {space_id: 'id'}, return the snake_case ORIGINAL name (e.g. 'space_id') of
// any param whose URL placeholder is now `{id}`. Returns null when no
// rename-to-id is recorded — the literal `id` then represents the entity's
// own id and createStep should skip it.
function originalSnakeNameOfRenamedId(point: any): string | null {
  const renameMap = point?.rename?.param || {}
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
    // Use last point as most generic
    const point = getelem(opmap.create.points, -1)
    const step = newFlowStep('create', args)

    each(point.args.params, (param: any) => {
      if ('id' === param.name) {
        const origName = originalSnakeNameOfRenamedId(point)
        if (origName) {
          step.match[origName] = args.input?.[origName] ?? origName.replace(/_id/, '') + '01'
        }
        // If there's no rename-from, this is genuinely the entity's id — skip
        // (the create call generates it).
        return
      }
      step.match[param.name] = args.input?.[param.name] ?? param.name.replace(/_id/, '') + '01'
    })

    seedRelatedOpParams(opmap, point, step)

    flow.step.push(step)
  }
}


function seedRelatedOpParams(opmap: any, createPoint: any, step: ModelEntityFlowStep) {
  const otherOps = ['list', 'load', 'update', 'remove']
  for (const opname of otherOps) {
    const op = opmap[opname]
    if (!op?.points) continue
    for (const point of op.points) {
      const params: any[] = point?.args?.params || []
      for (const param of params) {
        if (!param?.name) continue
        if (isEntityIdParam(point, param, opname as any)) continue
        if (step.match[param.name] !== undefined) continue
        if ('id' === param.name) continue
        step.match[param.name] =
          param.name.replace(/_id/, '') + '01'
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
    // Use last point as most generic
    const point = getelem(opmap.list.points, -1)
    const step = newFlowStep('list', args)

    each(point.args.params, (param: any) => {
      if ('id' === param.name) {
        const origName = originalSnakeNameOfRenamedId(point)
        if (origName) {
          step.match[origName] = args.input?.[origName] ?? origName.replace(/_id/, '') + '01'
        }
        return
      }
      step.match[param.name] = args.input?.[param.name] ?? param.name.replace(/_id/, '') + '01'
    })

    flow.step.push(step)
  }
}


const updateStep: MakeFlowStep = (
  opmap: any,
  flow: ModelEntityFlow,
  ent: ModelEntity,
  args: Record<string, any>
) => {
  if (null != opmap.update) {
    // Use last point as most generic
    const point = getelem(opmap.update.points, -1)
    const step = newFlowStep('update', args)

    each(point.args.params, (param: any) => {
      if (isEntityIdParam(point, param, 'update')) {
        // Entity's own id — supplied at test time via the loaded/created
        // entity's id field, not as a separate body parameter. Skip.
        return
      }
      step.data[param.name] = args.input?.[param.name] ?? param.name.replace(/_id/, '') + '01'
    })

    flow.step.push(step)
  }
}


const loadStep: MakeFlowStep = (
  opmap: any,
  flow: ModelEntityFlow,
  ent: ModelEntity,
  args: Record<string, any>
) => {
  if (null != opmap.load) {
    // Use last point as most generic
    const point = getelem(opmap.load.points, -1)
    const step = newFlowStep('load', args)

    each(point.args.params, (param: any) => {
      if (isEntityIdParam(point, param, 'load')) {
        step.match.id = args.input?.id ?? ent.name + '01'
      }
      else {
        step.match[param.name] = args.input?.[param.name] ?? param.name.replace(/_id/, '') + '01'
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
    // Use last point as most generic
    const point = getelem(opmap.remove.points, -1)
    const step = newFlowStep('remove', args)

    each(point.args.params, (param: any) => {
      if (isEntityIdParam(point, param, 'remove')) {
        step.match.id = args.input?.id ?? ent.name + '01'
      }
      else {
        step.match[param.name] = args.input?.[param.name] ?? param.name.replace(/_id/, '') + '01'
      }
    })

    flow.step.push(step)
  }
}


function firstTextField(ent: ModelEntity, op?: ModelOp) {
  const paramNames: Record<string, boolean> = {}
  each((op as any)?.points).forEach((pt: any) => {
    each(pt?.args?.params).forEach((p: any) => {
      if (p && null != p.name) {
        paramNames[p.name] = true
      }
    })
  })

  const fields = each(ent.fields)
  for (let fI = 0; fI < fields.length; fI++) {
    const field = fields[fI]
    // NOT A readOnly FIELD. The flow writes this one and then asserts the
    // mark comes back, so a field the client may not send fails the step it
    // was chosen for. Fields are sorted by name, so which field this lands on
    // is alphabetical accident: solar's planet, once its spec declared the
    // server-assigned `forbidReason`, marked that instead of `kind`.
    if ('`$STRING`' === field.type && 'id' !== field.name &&
      true !== field.readOnly && true !== paramNames[field.name]) {
      return field
    }
  }
}

export {
  flowstepTransform,
}
