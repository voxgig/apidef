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
    const { apimodel, model } = ctx;
    const apiEntity = apimodel.main.api.entity[entity.name];
    const flow = {
        name: 'Basic' + apiEntity.Name
    };
    const refs = [
        `${apiEntity.name}01`,
        `${apiEntity.name}02`,
        `${apiEntity.name}03`,
    ];
    const idmap = refs.reduce((a, ref) => (a[ref] = ref.toUpperCase(), a), {});
    flow.model = {
        name: flow.Name,
        param: {
            [`${model.NAME}_TEST_${apiEntity.NAME}_ENTID`]: idmap
        },
        test: { entity: { [apiEntity.Name]: {} } },
        step: []
    };
    (0, jostraca_1.names)(flow, flow.name);
    const data = flow.model.test.entity[apiEntity.Name];
    refs.map(ref => {
        const id = idmap[ref];
        data[id] = { id };
    });
    return flow;
}
//# sourceMappingURL=flowHeuristic01.js.map