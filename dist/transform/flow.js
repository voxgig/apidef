"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.flowTransform = void 0;
const jostraca_1 = require("jostraca");
const utility_1 = require("../utility");
const types_1 = require("../types");
const flowTransform = async function (ctx) {
    const { apimodel, guide } = ctx;
    const kit = apimodel.main[types_1.KIT];
    let msg = '';
    (0, jostraca_1.each)(guide.entity, (guideEntity, entname) => {
        ctx.log.debug({ point: 'guide-flow', note: entname });
        const modelent = kit.entity[entname];
        const basicflow = {
            name: 'Basic' + (0, utility_1.nom)(modelent, 'Name') + 'Flow',
            entity: entname,
            kind: 'basic',
            step: [],
        };
        kit.flow[basicflow.name] = basicflow;
        msg += basicflow.name + ' ';
    });
    return { ok: true, msg };
};
exports.flowTransform = flowTransform;
//# sourceMappingURL=flow.js.map