

import { each } from 'jostraca'

import type { TransformResult, Transform } from '../transform'

import { fixName } from '../transform'


const entityTransform: Transform = async function(
  ctx: any,
  // guide: Guide,
  // // tspec: TransformSpec,
  // model: any,
  // def: any
): Promise<TransformResult> {
  const { apimodel, model, def } = ctx
  const guide = model.main.api.guide

  let msg = ''

  each(guide.entity, (guideEntity: any) => {
    const entityName = guideEntity.key$
    ctx.log.debug({ point: 'guide-entity', note: entityName })

    const entityModel: any = apimodel.main.api.entity[entityName] = {
      op: {},
      field: {},
      cmd: {},
      id: {
        name: 'id',
        field: 'id',
      }
    }

    fixName(entityModel, guideEntity.key$)

    each(guideEntity.path, (guidePath: any) => {
      const path = guidePath.key$
      const pathdef = def.paths[path]

      if (null == pathdef) {
        throw new Error('path not found in OpenAPI: ' + path +
          ' (entity: ' + guideEntity.name + ')')
      }

      // TODO: is this needed?
      guidePath.parts$ = path.split('/')
      guidePath.params$ = guidePath.parts$
        .filter((p: string) => p.startsWith('{'))
        .map((p: string) => p.substring(1, p.length - 1))

    })

    msg += guideEntity.name + ' '
  })

  return { ok: true, msg }
}


export {
  entityTransform
}
