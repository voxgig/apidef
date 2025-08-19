
import { size } from '@voxgig/struct'

import { each, names } from 'jostraca'


async function flowHeuristic01(ctx: any): Promise<any[]> {
  let entity = ctx.guide.entity

  const flows: any[] = []

  each(entity, (entity: any) => {
    flows.push(resolveBasicEntityFlow(ctx, entity))
  })

  return flows
}




function resolveBasicEntityFlow(ctx: any, entity: any) {
  const { apimodel, model } = ctx
  const apiEntity = apimodel.main.api.entity[entity.name]

  const flow: any = {
    name: 'Basic' + apiEntity.Name + 'Flow'
  }

  const refs = [
    `${apiEntity.name}01`,
    `${apiEntity.name}02`,
    `${apiEntity.name}03`,
  ]

  const idmap = refs.reduce((a: any, ref) => (a[ref] = ref.toUpperCase(), a), {})

  flow.model = ({
    name: flow.name,
    active: true,
    param: {
      [`${model.NAME}_TEST_${apiEntity.NAME}_ENTID`]: idmap,
      [`${model.NAME}_TEST_LIVE`]: "FALSE",
      [`${model.NAME}_TEST_EXPLAIN`]: "FALSE",
    },
    test: { entity: { [apiEntity.name]: {} } },
    step: []
  } as any)

  names(flow, flow.name)


  const data = flow.model.test.entity[apiEntity.name]

  refs.map((ref, i) => {
    const id = idmap[ref]
    const ent: any = data[id] = {}

    let num = (i * size(apiEntity.field) * 10)
    each(apiEntity.field, (field) => {
      ent[field.name] =
        'number' === field.type ? num :
          'boolean' === field.type ? 0 === num % 2 :
            'object' === field.type ? {} :
              'array' === field.type ? [] :
                's' + (num.toString(16))
      num++
    })

    ent.id = id
  })


  const steps = flow.model.step

  let num = 0
  let name

  const am: any = {}

  if (apiEntity.op.load) {

    // Get additional required match properties
    each(apiEntity.op.load.param, (param: any) => {
      if (param.required) {
        let ancestorName = param.name
        let ancestorEntity = apimodel.main.api.entity[ancestorName]

        if (null == ancestorEntity) {
          ancestorName = ancestorName.replace('_id', '')
          ancestorEntity = apimodel.main.api.entity[ancestorName]
        }

        if (ancestorEntity && ancestorName !== apiEntity.name) {
          flow.model.param[`${model.NAME}_TEST_${ancestorEntity.NAME}_ENTID`] = {
            [ancestorEntity.name + '01']: ancestorEntity.NAME + '01'
          }
          am[param.name] =
            `\`dm$=p.${model.NAME}_TEST_${ancestorEntity.NAME}_ENTID.${ancestorEntity.name}01\``

          data[`${apiEntity.NAME}01`][param.name] = ancestorEntity.NAME + '01'
        }
      }
    })


    name = `load_${apiEntity.name}${num}`
    steps.push({
      name,
      kind: 'entity',
      entity: `${apiEntity.name}`,
      action: 'load',
      match: {
        id: `\`dm$=p.${model.NAME}_TEST_${apiEntity.NAME}_ENTID.${apiEntity.name}01\``,
        ...am,
      },
      valid: {
        '`$OPEN`': true,
        id: `\`dm$=s.${name}.match.id\``,
        ...am,
      }
    })
  }

  if (apiEntity.op.update && apiEntity.op.load) {
    num++
    name = `update_${apiEntity.name}${num}`
    const id = idmap[`${apiEntity.name}01`]
    const loadref = `load_${apiEntity.name}${num - 1}`
    const reqdata = makeUpdateData(name, apiEntity, flow, id)
    const valid = makeUpdateValid(name, apiEntity, flow, id, reqdata)
    steps.push({
      name,
      ref: loadref,
      action: 'update',
      reqdata,
      valid: {
        '`$OPEN`': true,
        id: `\`dm$=s.${loadref}.match.id\``,
        ...am,
        ...valid
      }
    })

    num++
    name = `load_${apiEntity.name}${num}`

    steps.push({
      name,
      kind: 'entity',
      entity: `${apiEntity.name}`,
      action: 'load',
      match: {
        id: `\`dm$=p.${model.NAME}_TEST_${apiEntity.NAME}_ENTID.${apiEntity.name}01\``,
        ...am,
      },
      valid: {
        '`$OPEN`': true,
        id: `\`dm$=s.${loadref}.match.id\``,
        ...am,
        ...valid
      }
    })

  }


  return flow
}


function makeUpdateData(name: string, apiEntity: any, flow: any, id: string) {
  const ud: any = {}
  const data = flow.model.test.entity[apiEntity.name]

  const dataFields = each(apiEntity.field).filter(f => 'id' !== f.name && !f.name.includes('_id'))
  const stringFields = each(dataFields).filter(f => 'string' === f.type)

  if (0 < size(stringFields)) {
    const f = stringFields[0]
    ud[f.name] = data[id][f.name] + '-`$WHEN`'
  }

  return ud
}


function makeUpdateValid(name: string, apiEntity: any, flow: any, id: string, reqdata: any) {
  const vd: any = {}

  each(reqdata, (n) => {
    vd[n.key$] = `\`dm$=s.${name}.reqdata.${n.key$}\``
  })

  return vd
}

export {
  flowHeuristic01
}
