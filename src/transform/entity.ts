

import { each, snakify } from 'jostraca'

import type { TransformResult, Transform } from '../transform'

import { fixName } from '../transform'

import { depluralize } from '../utility'


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
      },
      ancestors: []
    }

    fixName(entityModel, guideEntity.key$)

    let ancestors: string[] = []
    let ancestorsDone = false

    each(guideEntity.path, (guidePath: any, pathStr: string) => {
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

      if (!ancestorsDone) {
        // Find all path sections matching /foo/{..param..} and build ancestors array
        const paramRegex = /\/([a-zA-Z0-9_-]+)\/\{[a-zA-Z0-9_-]+\}/g
        let m
        while ((m = paramRegex.exec(pathStr)) !== null) {
          // Skip if this is the last section (the entity itself)
          const remainingPath = pathStr.substring(m.index + m[0].length)
          if (remainingPath.length > 0) {
            const ancestorName = depluralize(snakify(m[1]))
            ancestors.push(ancestorName)
          }
        }

        ancestorsDone = true
      }
    })

    entityModel.ancestors = ancestors

    msg += guideEntity.name + ' '
  })

  return { ok: true, msg }
}


export {
  entityTransform
}
