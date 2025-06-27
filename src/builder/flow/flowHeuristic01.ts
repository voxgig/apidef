

import { each, names } from 'jostraca'



async function flowHeuristic01(ctx: any): Promise<any[]> {
  let entity = ctx.model.main.api.guide.entity

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
    name: 'Basic' + apiEntity.Name
  }

  const refs = [
    `${apiEntity.name}01`,
    `${apiEntity.name}02`,
    `${apiEntity.name}03`,
  ]

  const idmap = refs.reduce((a: any, ref) => (a[ref] = ref.toUpperCase(), a), {})

  flow.model = ({
    name: flow.Name,
    param: {
      [`${model.NAME}_TEST_${apiEntity.NAME}_ENTID`]: idmap
    },
    test: { entity: { [apiEntity.Name]: {} } },
    step: []
  } as any)

  names(flow, flow.name)

  const data = flow.model.test.entity[apiEntity.Name]

  refs.map(ref => {
    const id = idmap[ref]
    data[id] = { id }
  })


  return flow
}



export {
  flowHeuristic01
}
