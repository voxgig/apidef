

import { each, getx } from 'jostraca'

import type { TransformResult, Transform } from '../transform'

import { fixName } from '../transform'



const fieldTransform: Transform = async function(
  ctx: any,
  // guide: Guide,
  // // tspec: TransformSpec,
  // model: any,
  // def: any
): Promise<TransformResult> {
  const { apimodel, model, def } = ctx
  const guide = model.main.api.guide

  let msg = 'fields: '

  each(guide.entity, (guideEntity: any) => {
    const entityName = guideEntity.key$
    const entityModel = apimodel.main.api.entity[entityName]

    let fieldCount = 0
    each(guideEntity.path, (guidePath: any) => {
      const path = guidePath.key$
      const pathdef = def.paths[path]

      each(guidePath.op, (op: any) => {
        const opname = op.key$

        if ('load' === opname) {
          fieldCount = fieldbuild(entityModel, pathdef, op, guidePath, guideEntity, model)
        }

      })
    })

    msg += guideEntity.name + '=' + fieldCount + ' '
  })

  return { ok: true, msg }
}


function fieldbuild(
  entityModel: any, pathdef: any, op: any, path: any, entity: any, model: any
) {
  let fieldCount = 0
  let fieldSets = getx(pathdef.get, 'responses 200 content "application/json" schema')

  if (fieldSets) {
    if (Array.isArray(fieldSets.allOf)) {
      fieldSets = fieldSets.allOf
    }
    else if (fieldSets.properties) {
      fieldSets = [fieldSets]
    }
  }

  each(fieldSets, (fieldSet: any) => {
    each(fieldSet.properties, (property: any) => {
      const field =
        (entityModel.field[property.key$] = entityModel.field[property.key$] || {})

      field.name = property.key$
      fixName(field, field.name)

      field.type = property.type
      fixName(field, field.type, 'type')

      field.short = property.description

      fieldCount++
    })
  })

  // Guess id field name using GET path param
  if ('load' === op.key$) {
    const getdef = pathdef.get
    const getparams = getdef.parameters || []
    if (1 === getparams.length) {
      if (entityModel.op.load.path.match(RegExp('\\{' + getdef.parameters[0].name + '\\}$'))) {
        entityModel.id.field = getdef.parameters[0].name
      }
    }
  }

  return fieldCount
}



export {
  fieldTransform
}

