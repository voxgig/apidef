"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.flowHeuristic01 = flowHeuristic01;
const struct_1 = require("@voxgig/struct");
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
        name: 'Basic' + apiEntity.Name + 'Flow'
    };
    const refs = [
        `${apiEntity.name}01`,
        `${apiEntity.name}02`,
        `${apiEntity.name}03`,
    ];
    const idmap = refs.reduce((a, ref) => (a[ref] = ref.toUpperCase(), a), {});
    flow.model = {
        name: flow.name,
        active: true,
        param: {
            [`${model.NAME}_TEST_${apiEntity.NAME}_ENTID`]: idmap,
            [`${model.NAME}_TEST_LIVE`]: "FALSE",
            [`${model.NAME}_TEST_EXPLAIN`]: "FALSE",
        },
        test: { entity: { [apiEntity.name]: {} } },
        step: []
    };
    (0, jostraca_1.names)(flow, flow.name);
    const data = flow.model.test.entity[apiEntity.name];
    refs.map((ref, i) => {
        const id = idmap[ref];
        const ent = data[id] = {};
        let num = (i * (0, struct_1.size)(apiEntity.field) * 10);
        (0, jostraca_1.each)(apiEntity.field, (field) => {
            ent[field.name] =
                'number' === field.type ? num :
                    'boolean' === field.type ? 0 === num % 2 :
                        'object' === field.type ? {} :
                            'array' === field.type ? [] :
                                's' + (num.toString(16));
            num++;
        });
        ent.id = id;
    });
    const steps = flow.model.step;
    let num = 0;
    let name;
    if (apiEntity.op.load) {
        name = `load_${apiEntity.name}${num}`;
        steps.push({
            name,
            kind: 'entity',
            entity: `${apiEntity.name}`,
            action: 'load',
            match: {
                id: `\`dm$=p.${model.NAME}_TEST_${apiEntity.NAME}_ENTID.${apiEntity.name}01\``
            },
            valid: {
                '`$OPEN`': true,
                id: `\`dm$=s.${name}.match.id\``
            }
        });
    }
    if (apiEntity.op.update && apiEntity.op.load) {
        num++;
        name = `update_${apiEntity.name}${num}`;
        const id = idmap[`${apiEntity.name}01`];
        const loadref = `load_${apiEntity.name}${num - 1}`;
        const reqdata = makeUpdateData(name, apiEntity, flow, id);
        const valid = makeUpdateValid(name, apiEntity, flow, id, reqdata);
        steps.push({
            name,
            ref: loadref,
            action: 'update',
            reqdata,
            valid: {
                '`$OPEN`': true,
                id: `\`dm$=s.${loadref}.match.id\``,
                ...valid
            }
        });
        num++;
        name = `load_${apiEntity.name}${num}`;
        steps.push({
            name,
            kind: 'entity',
            entity: `${apiEntity.name}`,
            action: 'load',
            match: {
                id: `\`dm$=p.${model.NAME}_TEST_${apiEntity.NAME}_ENTID.${apiEntity.name}01\``
            },
            valid: {
                '`$OPEN`': true,
                id: `\`dm$=s.${loadref}.match.id\``,
                ...valid
            }
        });
    }
    return flow;
}
function makeUpdateData(name, apiEntity, flow, id) {
    const ud = {};
    const data = flow.model.test.entity[apiEntity.name];
    const dataFields = (0, jostraca_1.each)(apiEntity.field).filter(f => 'id' !== f.name && !f.name.includes('_id'));
    const stringFields = (0, jostraca_1.each)(dataFields).filter(f => 'string' === f.type);
    if (0 < (0, struct_1.size)(stringFields)) {
        const f = stringFields[0];
        ud[f.name] = data[id][f.name] + '-`$WHEN`';
    }
    return ud;
}
function makeUpdateValid(name, apiEntity, flow, id, reqdata) {
    const vd = {};
    (0, jostraca_1.each)(reqdata, (n) => {
        vd[n.key$] = `\`dm$=s.${name}.reqdata.${n.key$}\``;
    });
    return vd;
}
//# sourceMappingURL=flowHeuristic01.js.map