"use strict";
/* Copyright (c) 2026 Voxgig, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.WEIGHTS_FORMAT = void 0;
exports.dense = dense;
exports.relu = relu;
exports.apply = apply;
exports.vector = vector;
exports.forward = forward;
exports.softmax = softmax;
exports.argmax = argmax;
exports.makeNet = makeNet;
exports.decide = decide;
exports.explain = explain;
exports.netsToTensors = netsToTensors;
exports.netsFromTensors = netsFromTensors;
exports.saveNets = saveNets;
exports.loadNets = loadNets;
// Dense inference over named features, for weights written by hand: a unit
// is a bias and a sparse row keyed by input name, so a typo in a row is an
// error rather than a silent zero.
const safetensors_1 = require("./safetensors");
function dense(inputs, units, act) {
    const index = Object.create(null);
    inputs.forEach((name, i) => index[name] = i);
    const outputs = Object.keys(units);
    const w = [];
    const b = [];
    for (const name of outputs) {
        const unit = units[name];
        const row = new Array(inputs.length).fill(0);
        for (const input of Object.keys(unit.w)) {
            const i = index[input];
            if (undefined === i) {
                throw new Error('nn: unit ' + name + ' weights unknown input ' + input);
            }
            row[i] = unit.w[input];
        }
        w.push(row);
        b.push(unit.b);
    }
    return { inputs, outputs, w, b, act };
}
function relu(x) {
    return 0 < x ? x : 0;
}
function apply(layer, x) {
    const out = [];
    for (let j = 0; j < layer.outputs.length; j++) {
        let sum = layer.b[j];
        const row = layer.w[j];
        for (let i = 0; i < row.length; i++) {
            sum += row[i] * x[i];
        }
        out.push('relu' === layer.act ? relu(sum) : sum);
    }
    return out;
}
function vector(names, x) {
    return names.map((name) => {
        const v = x[name];
        return 'number' === typeof v && Number.isFinite(v) ? v : 0;
    });
}
function forward(layers, x) {
    const acts = [x];
    for (const layer of layers) {
        acts.push(apply(layer, acts[acts.length - 1]));
    }
    return acts;
}
function softmax(logits) {
    let max = -Infinity;
    for (const v of logits) {
        max = v > max ? v : max;
    }
    const exps = logits.map((v) => Math.exp(v - max));
    const sum = exps.reduce((a, v) => a + v, 0);
    return exps.map((v) => v / sum);
}
// The first of equal maxima, so ties resolve to the earlier class.
function argmax(v) {
    let best = 0;
    for (let i = 1; i < v.length; i++) {
        if (v[i] > v[best]) {
            best = i;
        }
    }
    return best;
}
function makeNet(features, hidden, out) {
    const h = dense(features, hidden, 'relu');
    const o = dense(h.outputs, out, 'linear');
    return { features, layers: [h, o], classes: o.outputs };
}
function decide(net, x) {
    const acts = forward(net.layers, vector(net.features, x));
    const hidden = acts[1];
    const logits = acts[acts.length - 1];
    const p = softmax(logits);
    const index = argmax(logits);
    const out = net.layers[net.layers.length - 1];
    const evidence = out.outputs.length === 0 ? [] : hidden
        .map((h, j) => ({ unit: out.inputs[j], amount: out.w[index][j] * h }))
        .filter((e) => 0 < e.amount)
        .sort((a, b) => b.amount - a.amount || (a.unit < b.unit ? -1 : 1))
        .slice(0, 3);
    return { cls: net.classes[index], index, p, logits, hidden, evidence };
}
// The weights file: one tensor per layer parameter, named as a state dict
// names them, with the feature, unit and class names in the metadata.
const WEIGHTS_FORMAT = 'apidef-guide-nn/1';
exports.WEIGHTS_FORMAT = WEIGHTS_FORMAT;
const WEIGHTS_DTYPE = 'F32';
function netsToTensors(nets) {
    const metadata = {
        format: WEIGHTS_FORMAT,
        nets: JSON.stringify(Object.keys(nets)),
    };
    const tensors = {};
    for (const [name, net] of Object.entries(nets)) {
        if (2 !== net.layers.length) {
            throw new Error('nn: network ' + name + ' is not two layers');
        }
        const [hidden, out] = net.layers;
        metadata[name + '.features'] = JSON.stringify(net.features);
        metadata[name + '.hidden'] = JSON.stringify(hidden.outputs);
        metadata[name + '.classes'] = JSON.stringify(out.outputs);
        metadata[name + '.activation'] = hidden.act;
        for (const [key, layer] of [['hidden', hidden], ['out', out]]) {
            tensors[name + '.' + key + '.weight'] = {
                dtype: WEIGHTS_DTYPE,
                shape: [layer.outputs.length, layer.inputs.length],
                data: layer.w.flat(),
            };
            tensors[name + '.' + key + '.bias'] = {
                dtype: WEIGHTS_DTYPE,
                shape: [layer.outputs.length],
                data: [...layer.b],
            };
        }
    }
    return { metadata, tensors };
}
function metaList(metadata, key) {
    let list = undefined;
    try {
        list = JSON.parse(metadata[key] ?? '');
    }
    catch (_err) { }
    if (!Array.isArray(list) || !list.every((v) => 'string' === typeof v)) {
        throw new Error('nn: weights metadata ' + key + ' is not a list of names');
    }
    return list;
}
function tensorLayer(st, name, inputs, outputs, act) {
    const weight = st.tensors[name + '.weight'];
    const bias = st.tensors[name + '.bias'];
    if (null == weight || null == bias) {
        throw new Error('nn: weights lack tensor ' + name);
    }
    const rows = outputs.length;
    const cols = inputs.length;
    if (2 !== weight.shape.length || rows !== weight.shape[0] || cols !== weight.shape[1] ||
        1 !== bias.shape.length || rows !== bias.shape[0]) {
        throw new Error('nn: tensor ' + name + ' does not fit ' + rows + ' units over ' + cols + ' inputs');
    }
    const w = [];
    for (let j = 0; j < rows; j++) {
        w.push(weight.data.slice(j * cols, (j + 1) * cols));
    }
    return { inputs, outputs, w, b: [...bias.data], act };
}
function netsFromTensors(st) {
    if (WEIGHTS_FORMAT !== st.metadata.format) {
        throw new Error('nn: weights format is ' + st.metadata.format + ', not ' + WEIGHTS_FORMAT);
    }
    const nets = {};
    for (const name of metaList(st.metadata, 'nets')) {
        const features = metaList(st.metadata, name + '.features');
        const hidden = metaList(st.metadata, name + '.hidden');
        const classes = metaList(st.metadata, name + '.classes');
        const act = st.metadata[name + '.activation'];
        if ('relu' !== act) {
            throw new Error('nn: network ' + name + ' has activation ' + act + ', not relu');
        }
        nets[name] = {
            features,
            layers: [
                tensorLayer(st, name + '.hidden', features, hidden, 'relu'),
                tensorLayer(st, name + '.out', hidden, classes, 'linear'),
            ],
            classes,
        };
    }
    return nets;
}
function saveNets(nets) {
    return (0, safetensors_1.serializeSafetensors)(netsToTensors(nets));
}
function loadNets(bytes) {
    return netsFromTensors((0, safetensors_1.parseSafetensors)(bytes));
}
// A one-line record of a decision for a why trace.
function explain(label, d) {
    const ev = d.evidence.map((e) => e.unit + '=' + e.amount.toFixed(1)).join(',');
    return 'nn:' + label + '=' + d.cls + '(' + d.p[d.index].toFixed(2) + ')' +
        ('' === ev ? '' : '[' + ev + ']');
}
//# sourceMappingURL=nn.js.map