

import { each } from 'jostraca'

import type { TransformCtx, TransformSpec } from '../transform'

import { fixName } from '../transform'



async function entityTransform(ctx: TransformCtx, tspec: TransformSpec, model: any, def: any) {
  const { guide: { guide } } = ctx
  let msg = ''

  each(guide.entity, (guideEntity: any) => {

    const entityModel: any = model.main.api.entity[guideEntity.key$] = {
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
      const pathdef = def.paths[guidePath.key$]

      if (null == pathdef) {
        throw new Error('APIDEF: path not found in OpenAPI: ' + guidePath.key$ +
          ' (entity: ' + guideEntity.name + ')')
      }

      guidePath.parts$ = guidePath.key$.split('/')
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
