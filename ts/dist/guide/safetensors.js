"use strict";
/* Copyright (c) 2026 Voxgig, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DTYPE_BYTES = void 0;
exports.parseSafetensors = parseSafetensors;
exports.serializeSafetensors = serializeSafetensors;
const DTYPE_BYTES = {
    F64: 8, F32: 4, F16: 2, BF16: 2, I64: 8, I32: 4, I16: 2, I8: 1, U8: 1, BOOL: 1,
};
exports.DTYPE_BYTES = DTYPE_BYTES;
const HEADER_ALIGN = 8;
const MAX_HEADER_BYTES = 100_000_000;
const SCRATCH = new DataView(new ArrayBuffer(4));
function fail(msg) {
    throw new Error('safetensors: ' + msg);
}
function isDtype(v) {
    return 'string' === typeof v && null != DTYPE_BYTES[v];
}
function isShape(v) {
    return Array.isArray(v) && v.every((n) => Number.isInteger(n) && 0 <= n);
}
function count(shape) {
    return shape.reduce((a, n) => a * n, 1);
}
function halfToDouble(bits) {
    const sign = bits & 0x8000 ? -1 : 1;
    const exp = (bits >> 10) & 0x1f;
    const frac = bits & 0x3ff;
    if (0 === exp) {
        return sign * frac * 2 ** -24;
    }
    if (0x1f === exp) {
        return 0 === frac ? sign * Infinity : NaN;
    }
    return sign * (1 + frac / 1024) * 2 ** (exp - 15);
}
function bfloatToDouble(bits) {
    SCRATCH.setUint32(0, (bits << 16) >>> 0);
    return SCRATCH.getFloat32(0);
}
function readValues(view, at, dtype, n) {
    const out = new Array(n);
    const size = DTYPE_BYTES[dtype];
    for (let i = 0; i < n; i++, at += size) {
        switch (dtype) {
            case 'F64':
                out[i] = view.getFloat64(at, true);
                break;
            case 'F32':
                out[i] = view.getFloat32(at, true);
                break;
            case 'F16':
                out[i] = halfToDouble(view.getUint16(at, true));
                break;
            case 'BF16':
                out[i] = bfloatToDouble(view.getUint16(at, true));
                break;
            case 'I64':
                out[i] = Number(view.getBigInt64(at, true));
                break;
            case 'I32':
                out[i] = view.getInt32(at, true);
                break;
            case 'I16':
                out[i] = view.getInt16(at, true);
                break;
            case 'I8':
                out[i] = view.getInt8(at);
                break;
            default: out[i] = view.getUint8(at);
        }
    }
    return out;
}
function writeValues(view, at, name, tensor) {
    const size = DTYPE_BYTES[tensor.dtype];
    for (const v of tensor.data) {
        switch (tensor.dtype) {
            case 'F64':
                view.setFloat64(at, v, true);
                break;
            case 'F32':
                view.setFloat32(at, v, true);
                break;
            case 'I64':
                view.setBigInt64(at, BigInt(v), true);
                break;
            case 'I32':
                view.setInt32(at, v, true);
                break;
            case 'I16':
                view.setInt16(at, v, true);
                break;
            case 'I8':
                view.setInt8(at, v);
                break;
            case 'U8':
            case 'BOOL':
                view.setUint8(at, v);
                break;
            default: fail('tensor ' + name + ': writing ' + tensor.dtype + ' is not supported');
        }
        at += size;
    }
    return at;
}
function parseSafetensors(bytes) {
    if (bytes.length < 8) {
        fail('shorter than its header length');
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const hlen = Number(view.getBigUint64(0, true));
    if (hlen > MAX_HEADER_BYTES || 8 + hlen > bytes.length) {
        fail('header length ' + hlen + ' exceeds the file');
    }
    let header;
    try {
        header = JSON.parse(new TextDecoder().decode(bytes.subarray(8, 8 + hlen)));
    }
    catch (err) {
        fail('header is not JSON: ' + err.message);
    }
    if (null == header || 'object' !== typeof header || Array.isArray(header)) {
        fail('header is not an object');
    }
    const metadata = {};
    for (const [key, val] of Object.entries(header.__metadata__ ?? {})) {
        if ('string' !== typeof val) {
            fail('metadata ' + key + ' is not a string');
        }
        metadata[key] = val;
    }
    const entries = [];
    for (const name of Object.keys(header)) {
        if ('__metadata__' === name) {
            continue;
        }
        const info = header[name];
        const offsets = info?.data_offsets;
        if (!isDtype(info?.dtype)) {
            fail('tensor ' + name + ' has unknown dtype ' + info?.dtype);
        }
        if (!isShape(info.shape)) {
            fail('tensor ' + name + ' has an invalid shape');
        }
        if (!Array.isArray(offsets) || 2 !== offsets.length ||
            !offsets.every((n) => Number.isInteger(n) && 0 <= n) || offsets[1] < offsets[0]) {
            fail('tensor ' + name + ' has invalid data offsets');
        }
        entries.push({ name, dtype: info.dtype, shape: info.shape, start: offsets[0], stop: offsets[1] });
    }
    entries.sort((a, b) => a.start - b.start);
    const base = 8 + hlen;
    const tensors = {};
    let next = 0;
    for (const entry of entries) {
        if (entry.start !== next) {
            fail('tensor ' + entry.name + ' does not follow the tensor before it');
        }
        const n = count(entry.shape);
        if (entry.stop - entry.start !== n * DTYPE_BYTES[entry.dtype]) {
            fail('tensor ' + entry.name + ' byte range does not match its shape');
        }
        if (base + entry.stop > bytes.length) {
            fail('tensor ' + entry.name + ' byte range exceeds the file');
        }
        tensors[entry.name] = {
            dtype: entry.dtype,
            shape: entry.shape,
            data: readValues(view, base + entry.start, entry.dtype, n),
        };
        next = entry.stop;
    }
    if (base + next !== bytes.length) {
        fail('tensor bytes do not fill the file');
    }
    return { metadata, tensors };
}
// Tensors are laid out in code-point order of their names, each directly
// after the last, and the header is padded to an 8-byte boundary.
function serializeSafetensors(st) {
    const names = Object.keys(st.tensors).sort();
    const header = {};
    if (0 < Object.keys(st.metadata).length) {
        header.__metadata__ = { ...st.metadata };
    }
    let offset = 0;
    for (const name of names) {
        const tensor = st.tensors[name];
        if (!isDtype(tensor.dtype)) {
            fail('tensor ' + name + ' has unknown dtype ' + tensor.dtype);
        }
        if (!isShape(tensor.shape) || count(tensor.shape) !== tensor.data.length) {
            fail('tensor ' + name + ' has ' + tensor.data.length + ' values for shape ' +
                JSON.stringify(tensor.shape));
        }
        const size = tensor.data.length * DTYPE_BYTES[tensor.dtype];
        header[name] = { dtype: tensor.dtype, shape: tensor.shape, data_offsets: [offset, offset + size] };
        offset += size;
    }
    const json = new TextEncoder().encode(JSON.stringify(header));
    const pad = (HEADER_ALIGN - json.length % HEADER_ALIGN) % HEADER_ALIGN;
    const out = new Uint8Array(8 + json.length + pad + offset);
    const view = new DataView(out.buffer);
    view.setBigUint64(0, BigInt(json.length + pad), true);
    out.set(json, 8);
    out.fill(0x20, 8 + json.length, 8 + json.length + pad);
    let at = 8 + json.length + pad;
    for (const name of names) {
        at = writeValues(view, at, name, st.tensors[name]);
    }
    return out;
}
//# sourceMappingURL=safetensors.js.map