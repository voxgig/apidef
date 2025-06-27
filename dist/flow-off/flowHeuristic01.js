"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.flowHeuristic01 = flowHeuristic01;
const jostraca_1 = require("jostraca");
async function flowHeuristic01(ctx) {
    let entity = ctx.model.main.api.guide.entity;
    const flows = [];
    (0, jostraca_1.each)(entity, (entity) => {
        flows.push(resolveBasicEntityFlow(ctx, entity));
    });
    return flows;
}
function resolveBasicEntityFlow(ctx, entity) {
    const apiEntity = ctx.apimodel.main.api.entity[entity.name];
    const flow = {
        name: 'Basic' + apiEntity.Name
    };
    flow.model = {
        name: flow.Name,
        param: {},
        test: { entity: { [apiEntity.Name]: {} } },
        step: []
    };
    (0, jostraca_1.names)(flow, flow.name);
    return flow;
}
//# sourceMappingURL=flowHeuristic01.js.map