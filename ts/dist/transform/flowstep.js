"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.flowstepTransform = void 0;
const jostraca_1 = require("jostraca");
const struct_1 = require("@voxgig/struct");
function isEntityIdParam(point, param, opname) {
    if ('id' === param?.name)
        return true;
    const renameMap = point?.rename?.param;
    if (renameMap && param?.name) {
        const camel = (0, jostraca_1.lcf)((0, jostraca_1.camelify)(param.name));
        if ('id' === renameMap[camel])
            return true;
    }
    if ('update' === opname || 'load' === opname || 'remove' === opname) {
        const segments = point?.segments || [];
        let last = null;
        for (const s of segments) {
            if (null != s?.var)
                last = s.var;
        }
        if (last && last === param?.name)
            return true;
    }
    return false;
}
const types_1 = require("../types");
const flowstepTransform = async function (ctx) {
    const { apimodel, guide } = ctx;
    const kit = apimodel.main[types_1.KIT];
    let msg = '';
    (0, jostraca_1.each)(kit.flow, (flow, flowname) => {
        ctx.log.debug({ point: 'flowstep', note: flowname });
        const ent = kit.entity[flow.entity];
        const opmap = ent.op;
        const ref01 = ent.name + '_ref01';
        createStep(opmap, flow, ent, { input: { ref: ref01 } });
        listStep(opmap, flow, ent, { valid: [{ apply: 'ItemExists', def: { ref: ref01 } }] });
        const mark01 = 'Mark01-' + ref01;
        const firsttf = firstTextField(ent, opmap.update);
        updateStep(opmap, flow, ent, {
            input: {
                ref: ref01,
                textfield: firsttf?.n,
                suffix: '_up0',
                srcdatavar: ref01 + '_data'
            },
            spec: [{
                    apply: 'TextFieldMark',
                    def: { mark: mark01 }
                }]
        });
        loadStep(opmap, flow, ent, {
            input: {
                ref: ref01,
                suffix: '_dt0',
                srcdatavar: ref01 + '_data'
            },
            valid: [{
                    apply: 'TextFieldMark',
                    def: { mark: mark01 }
                }]
        });
        removeStep(opmap, flow, ent, {
            input: { ref: ref01, suffix: '_rm0' }
        });
        // The "removed item is gone" verify LIST only makes sense after a real
        // remove step, which is now gated on create. Gate the verify on create
        // too, so create-less flows stay read-only.
        if (null != opmap.remove && null != opmap.create) {
            listStep(opmap, flow, ent, {
                input: { suffix: '_rt0' },
                valid: [{ apply: 'ItemNotExists', def: { ref: ref01 } }]
            });
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
// Reverse-lookup: given a point with rename.param like {spaceId: 'id'} or
// {space_id: 'id'}, return the snake_case ORIGINAL name (e.g. 'space_id') of
// any param whose URL placeholder is now `{id}`. Returns null when no
// rename-to-id is recorded — the literal `id` then represents the entity's
// own id and createStep should skip it.
function originalSnakeNameOfRenamedId(point) {
    const renameMap = point?.rename?.param || {};
    for (const [src, dst] of Object.entries(renameMap)) {
        if ('id' === dst) {
            const srcStr = String(src);
            // Already snake_case? Use as-is. Otherwise convert to snake form.
            return srcStr.includes('_') ? srcStr : (srcStr.replace(/[A-Z]/g, m => '_' + m.toLowerCase()).replace(/^_/, ''));
        }
    }
    return null;
}
const createStep = (opmap, flow, ent, args) => {
    if (null != opmap.create) {
        // Use last point as most generic
        const point = (0, struct_1.getelem)(opmap.create.points, -1);
        const step = newFlowStep('create', args);
        (0, jostraca_1.each)(point.args.params, (param) => {
            if ('id' === param.name) {
                const origName = originalSnakeNameOfRenamedId(point);
                if (origName) {
                    step.match[origName] = args.input?.[origName] ?? origName.replace(/_id/, '') + '01';
                }
                // If there's no rename-from, this is genuinely the entity's id — skip
                // (the create call generates it).
                return;
            }
            step.match[param.name] = args.input?.[param.name] ?? param.name.replace(/_id/, '') + '01';
        });
        seedRelatedOpParams(opmap, point, step);
        flow.step.push(step);
    }
};
function seedRelatedOpParams(opmap, createPoint, step) {
    const otherOps = ['list', 'load', 'update', 'remove'];
    for (const opname of otherOps) {
        const op = opmap[opname];
        if (!op?.points)
            continue;
        for (const point of op.points) {
            const params = point?.args?.params || [];
            for (const param of params) {
                if (!param?.name)
                    continue;
                if (isEntityIdParam(point, param, opname))
                    continue;
                if (step.match[param.name] !== undefined)
                    continue;
                if ('id' === param.name)
                    continue;
                step.match[param.name] =
                    param.name.replace(/_id/, '') + '01';
            }
        }
    }
}
const listStep = (opmap, flow, ent, args) => {
    if (null != opmap.list) {
        // Use last point as most generic
        const point = (0, struct_1.getelem)(opmap.list.points, -1);
        const step = newFlowStep('list', args);
        (0, jostraca_1.each)(point.args.params, (param) => {
            if ('id' === param.name) {
                const origName = originalSnakeNameOfRenamedId(point);
                if (origName) {
                    step.match[origName] = args.input?.[origName] ?? origName.replace(/_id/, '') + '01';
                }
                return;
            }
            step.match[param.name] = args.input?.[param.name] ?? param.name.replace(/_id/, '') + '01';
        });
        flow.step.push(step);
    }
};
const updateStep = (opmap, flow, ent, args) => {
    if (null != opmap.update) {
        // Use last point as most generic
        const point = (0, struct_1.getelem)(opmap.update.points, -1);
        const step = newFlowStep('update', args);
        (0, jostraca_1.each)(point.args.params, (param) => {
            if (isEntityIdParam(point, param, 'update')) {
                // Entity's own id — supplied at test time via the loaded/created
                // entity's id field, not as a separate body parameter. Skip.
                return;
            }
            step.data[param.name] = args.input?.[param.name] ?? param.name.replace(/_id/, '') + '01';
        });
        flow.step.push(step);
    }
};
const loadStep = (opmap, flow, ent, args) => {
    if (null != opmap.load) {
        // Use last point as most generic
        const point = (0, struct_1.getelem)(opmap.load.points, -1);
        const step = newFlowStep('load', args);
        (0, jostraca_1.each)(point.args.params, (param) => {
            if (isEntityIdParam(point, param, 'load')) {
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
    // A REMOVE must operate on an entity the flow itself CREATEd — never on
    // pre-existing data. If the entity has no create op (e.g. merchant), emit
    // no remove step at all; a create-less remove would delete real records in
    // live mode and makes no sense as a self-contained CRUD test.
    if (null != opmap.remove && null != opmap.create) {
        // Use last point as most generic
        const point = (0, struct_1.getelem)(opmap.remove.points, -1);
        const step = newFlowStep('remove', args);
        (0, jostraca_1.each)(point.args.params, (param) => {
            if (isEntityIdParam(point, param, 'remove')) {
                step.match.id = args.input?.id ?? ent.name + '01';
            }
            else {
                step.match[param.name] = args.input?.[param.name] ?? param.name.replace(/_id/, '') + '01';
            }
        });
        flow.step.push(step);
    }
};
function firstTextField(ent, op) {
    const paramNames = {};
    (0, jostraca_1.each)(op?.points).forEach((pt) => {
        (0, jostraca_1.each)(pt?.args?.params).forEach((p) => {
            if (p && null != p.name) {
                paramNames[p.name] = true;
            }
        });
    });
    const fields = Object.keys(ent.fields).sort().map(n => ent.fields[n]);
    for (let fI = 0; fI < fields.length; fI++) {
        const field = fields[fI];
        // NOT A readOnly FIELD. The flow writes this one and then asserts the
        // mark comes back, so a field the client may not send fails the step it
        // was chosen for. Fields are sorted by name, so which field this lands on
        // is alphabetical accident: solar's planet, once its spec declared the
        // server-assigned `forbidReason`, marked that instead of `kind`.
        if ('`$STRING`' === field.t && 'id' !== field.n &&
            true !== field.ro && true !== paramNames[field.n]) {
            return field;
        }
    }
}
//# sourceMappingURL=flowstep.js.map