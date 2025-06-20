

import { each, snakify, names } from 'jostraca'



async function flowHeuristic01(ctx: any): Promise<any[]> {
  let entity = ctx.model.main.api.guide.entity

  const flows: any[] = []

  each(entity, (entity: any) => {
    flows.push(resolveBasicEntityFlow(ctx, entity))
  })

  return flows
}




function resolveBasicEntityFlow(ctx: any, entity: any) {
  const apiEntity = ctx.apimodel.main.api.entity[entity.name]

  const flow: any = {
    name: 'Basic' + apiEntity.Name
  }

  flow.model = ({
    name: flow.Name,
    param: {},
    test: { entity: { [apiEntity.Name]: {} } },
    step: []
  } as any)

  names(flow, flow.name)

  return flow
}



export {
  flowHeuristic01
}
