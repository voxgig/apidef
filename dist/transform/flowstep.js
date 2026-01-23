"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.flowstepTransform = void 0;
const jostraca_1 = require("jostraca");
const struct_1 = require("@voxgig/struct");
const types_1 = require("../types");
const flowstepTransform = async function (ctx) {
    const { apimodel, guide } = ctx;
    const kit = apimodel.main[types_1.KIT];
    let msg = '';
    (0, jostraca_1.each)(kit.flow, (flow, flowname) => {
        ctx.log.debug({ point: 'flowstep', note: flowname });
        const ent = kit.entity[flow.entity];
        const opmap = ent.op;
        console.log('FLOWSTEP', flowname, opmap);
        // TODO: spec parameter passed into each step func, used semantically by generator
        // validation: part of spec, semantic name and params, up to generator how to use it
        const idn01 = ent.name + '_n01';
        createStep(opmap, flow, ent, { input: { id: idn01 } });
        listStep(opmap, flow, ent, { valid: [{ apply: 'ItemExists', spec: { id: idn01 } }] });
        const mark01 = 'Mark01-' + idn01;
        updateStep(opmap, flow, ent, {
            input: { id: idn01 },
            spec: [{
                    apply: 'TextFieldMark',
                    def: { mark: mark01 }
                }]
        });
        loadStep(opmap, flow, ent, {
            input: {
                id: idn01,
            },
            valid: [{
                    apply: 'TextFieldMark',
                    def: { mark: mark01 }
                }]
        });
        removeStep(opmap, flow, ent, { input: { id: idn01 } });
        if (null != opmap.remove) {
            listStep(opmap, flow, ent, { valid: [{ apply: 'ItemNotExists', def: { id: idn01 } }] });
        }
        msg += flowname + ' ';
    });
    return { ok: true, msg };
};
exports.flowstepTransform = flowstepTransform;
function newFlowStep(opname, args) {
    return {
        op: opname,
        input: args.input ?? {},
        match: args.match ?? {},
        data: args.data ?? {},
        spec: args.spec ?? [],
        valid: args.valid ?? [],
    };
}
const createStep = (opmap, flow, ent, args) => {
    if (null != opmap.update) {
        // Use last alt as most generic
        const alt = (0, struct_1.getelem)(opmap.update.alts, -1);
        const step = newFlowStep('create', args);
        (0, jostraca_1.each)(alt.args.param, (param) => {
            if ('id' === param.name) {
                step.data.id = args.input?.id ?? ent.name + '99';
            }
            else {
                step.data[param.name] = args.input?.[param.name] ?? param.name.replace(/_id/, '') + '01';
            }
        });
        flow.step.push(step);
    }
};
const listStep = (opmap, flow, ent, args) => {
    if (null != opmap.list) {
        // Use last alt as most generic
        const alt = (0, struct_1.getelem)(opmap.list.alts, -1);
        const step = newFlowStep('list', args);
        (0, jostraca_1.each)(alt.args.param, (param) => {
            step.match[param.name] = args.input?.[param.name] ?? param.name.replace(/_id/, '') + '01';
        });
        flow.step.push(step);
    }
};
const updateStep = (opmap, flow, ent, args) => {
    if (null != opmap.update) {
        // Use last alt as most generic
        const alt = (0, struct_1.getelem)(opmap.update.alts, -1);
        const step = newFlowStep('update', args);
        (0, jostraca_1.each)(alt.args.param, (param) => {
            if ('id' === param.name) {
                step.data.id = args.input?.id ?? ent.name + '01';
            }
            else {
                step.data[param.name] = args.input?.[param.name] ?? param.name.replace(/_id/, '') + '01';
            }
        });
        flow.step.push(step);
    }
};
const loadStep = (opmap, flow, ent, args) => {
    if (null != opmap.load) {
        // Use last alt as most generic
        const alt = (0, struct_1.getelem)(opmap.update.alts, -1);
        const step = newFlowStep('load', args);
        (0, jostraca_1.each)(alt.args.param, (param) => {
            if ('id' === param.name) {
                step.match.id = args.input?.id ?? ent.name + '01';
            }
            else {
                step.match[param.name] = args.input?.[param.name] ?? param.name.replace(/_id/, '') + '01';
            }
        });
        flow.step.push(step);
    }
};
const removeStep = (opmap, flow, ent, args) => {
    if (null != opmap.remove) {
        // Use last alt as most generic
        const alt = (0, struct_1.getelem)(opmap.update.alts, -1);
        const step = newFlowStep('remove', args);
        (0, jostraca_1.each)(alt.args.param, (param) => {
            if ('id' === param.name) {
                step.match.id = args.input?.id ?? ent.name + '01';
            }
            else {
                step.match[param.name] = args.input?.[param.name] ?? param.name.replace(/_id/, '') + '01';
            }
        });
        flow.step.push(step);
    }
};
//# sourceMappingURL=flowstep.js.map