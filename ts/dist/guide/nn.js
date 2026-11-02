"use strict";
/* Copyright (c) 2026 Voxgig, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
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
// A one-line record of a decision for a why trace.
function explain(label, d) {
    const ev = d.evidence.map((e) => e.unit + '=' + e.amount.toFixed(1)).join(',');
    return 'nn:' + label + '=' + d.cls + '(' + d.p[d.index].toFixed(2) + ')' +
        ('' === ev ? '' : '[' + ev + ']');
}
//# sourceMappingURL=nn.js.map