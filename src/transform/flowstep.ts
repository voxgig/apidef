

import { each } from 'jostraca'

import type { TransformResult, Transform } from '../transform'

import { getelem } from '@voxgig/struct'

import {
  nom,
} from '../utility'

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

    console.log('FLOWSTEP', flowname, opmap)

    // TODO: spec parameter passed into each step func, used semantically by generator
    // validation: part of spec, semantic name and params, up to generator how to use it
    const idn01 = ent.name + '_n01'
    createStep(opmap, flow, ent, { input: { id: idn01 } })
    listStep(opmap, flow, ent,
      { valid: [{ apply: 'ItemExists', spec: { id: idn01 } }] })
    const mark01 = 'Mark01-' + idn01
    updateStep(opmap, flow, ent,
      {
        input: { id: idn01 },
        spec: [{
          apply: 'TextFieldMark',
          def: { mark: mark01 }
        }]
      })
    loadStep(opmap, flow, ent,
      {
        input: {
          id: idn01,
        },
        valid: [{
          apply: 'TextFieldMark',
          def: { mark: mark01 }
        }]
      })
    removeStep(opmap, flow, ent, { input: { id: idn01 } })

    if (null != opmap.remove) {
      listStep(opmap, flow, ent,
        { valid: [{ apply: 'ItemNotExists', def: { id: idn01 } }] })
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


const createStep: MakeFlowStep = (
  opmap: any,
  flow: ModelEntityFlow,
  ent: ModelEntity,
  args: Record<string, any>
) => {
  if (null != opmap.update) {
    // Use last alt as most generic
    const alt = getelem(opmap.update.alts, -1)
    const step = newFlowStep('create', args)

    each(alt.args.param, (param: any) => {
      if ('id' === param.name) {
        step.data.id = args.input?.id ?? ent.name + '99'
      }
      else {
        step.data[param.name] = args.input?.[param.name] ?? param.name.replace(/_id/, '') + '01'
      }
    })

    flow.step.push(step)
  }
}


const listStep: MakeFlowStep = (
  opmap: any,
  flow: ModelEntityFlow,
  ent: ModelEntity,
  args: Record<string, any>
) => {
  if (null != opmap.list) {
    // Use last alt as most generic
    const alt = getelem(opmap.list.alts, -1)
    const step = newFlowStep('list', args)

    each(alt.args.param, (param: any) => {
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
    // Use last alt as most generic
    const alt = getelem(opmap.update.alts, -1)
    const step = newFlowStep('update', args)

    each(alt.args.param, (param: any) => {
      if ('id' === param.name) {
        step.data.id = args.input?.id ?? ent.name + '01'
      }
      else {
        step.data[param.name] = args.input?.[param.name] ?? param.name.replace(/_id/, '') + '01'
      }
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
    // Use last alt as most generic
    const alt = getelem(opmap.update.alts, -1)
    const step = newFlowStep('load', args)

    each(alt.args.param, (param: any) => {
      if ('id' === param.name) {
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
  if (null != opmap.remove) {
    // Use last alt as most generic
    const alt = getelem(opmap.update.alts, -1)
    const step = newFlowStep('remove', args)

    each(alt.args.param, (param: any) => {
      if ('id' === param.name) {
        step.match.id = args.input?.id ?? ent.name + '01'
      }
      else {
        step.match[param.name] = args.input?.[param.name] ?? param.name.replace(/_id/, '') + '01'
      }
    })

    flow.step.push(step)
  }
}


export {
  flowstepTransform,
}
