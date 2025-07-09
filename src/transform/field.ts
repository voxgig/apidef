

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

  console.log('FIELD-DEF', entityModel, pathdef.get)

  each(fieldSets, (fieldSet: any) => {
    each(fieldSet.properties, (property: any) => {
      const field =
        (entityModel.field[property.key$] = entityModel.field[property.key$] || {})

      console.log('PROPERTY', property)

      field.name = property.key$
      fixName(field, field.name)

      // field.type = property.type
      resolveFieldType(entityModel, field, property)
      console.log('FIELD', field)
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


// Resovles a heuristic "primary" type which subsumes the more detailed type.
// The primary type is only: string, number, boolean, null, object, array
function resolveFieldType(entity: any, field: any, property: any) {
  const ptt = typeof property.type

  if ('string' === ptt) {
    field.type = property.type
  }
  else if (Array.isArray(property.type)) {
    field.type =
      (property.type.filter((t: string) => 'null' != t).sort()[0]) ||
      property.type[0] ||
      'string'
    field.typelist = property.type
  }
  else if ('undefined' === ptt && null != property.enum) {
    field.type = 'string'
    field.enum = property.enum
  }
  else {
    throw new Error(
      `APIDEF: Unsupported property type: ${property.type} (${entity.name}.${field.name})`)
  }
}


export {
  fieldTransform
}

