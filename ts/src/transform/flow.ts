

import { each } from 'jostraca'

import type { TransformResult, Transform } from '../transform'

import {
  nom,
} from '../utility'

import { KIT } from '../types'

import type { KitModel } from '../types'

import type {
  GuideEntity,
} from '../types'

import type {
  ModelEntity,
  ModelEntityFlow,
} from '../model'




const flowTransform: Transform = async function(
  ctx: any,
): Promise<TransformResult> {
  const { apimodel, guide } = ctx
  const kit: KitModel = apimodel.main[KIT]

  let msg = ''

  each(guide.entity, (guideEntity: GuideEntity, entname: string) => {
    ctx.log.debug({ point: 'guide-flow', note: entname })

    const modelent: ModelEntity = kit.entity[entname]

    const basicflow: ModelEntityFlow = {
      name: 'Basic' + nom(modelent, 'Name') + 'Flow',
      entity: entname,
      kind: 'basic',
      step: [],
    }

    kit.flow[basicflow.name] = basicflow

    msg += basicflow.name + ' '
  })

  return { ok: true, msg }
}



export {
  flowTransform,
}
