

import { each } from 'jostraca'

import type { TransformCtx, TransformSpec } from '../transform'

import { fixName } from '../transform'



async function entityTransform(ctx: TransformCtx, tspec: TransformSpec, model: any, def: any) {
  const { model: { main: { guide } } } = ctx
  let msg = ''

  // console.log('DEF', def)

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

      // console.log('APIDEF FIND PATH', guidePath.key$, Object.keys(def.paths),
      //  Object.keys(def.paths).includes(guidePath.key$))

      if (null == pathdef) {
        throw new Error('path not found in OpenAPI: ' + guidePath.key$ +
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
