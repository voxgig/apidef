"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getdlog = getdlog;
exports.loadFile = loadFile;
exports.formatJsonSrc = formatJsonSrc;
exports.depluralize = depluralize;
exports.find = find;
exports.capture = capture;
exports.pathMatch = pathMatch;
const node_path_1 = __importDefault(require("node:path"));
const struct_1 = require("@voxgig/struct");
function getdlog(tagin, filepath) {
    const tag = tagin || '-';
    const file = node_path_1.default.basename(filepath || '-');
    const g = global;
    g.__dlog__ = (g.__dlog__ || []);
    const dlog = (...args) => g.__dlog__.push([tag, file, Date.now(), ...args]);
    dlog.tag = tag;
    dlog.file = file;
    dlog.log = (filepath, f) => (f = null == filepath ? null : node_path_1.default.basename(filepath),
        g.__dlog__.filter((n) => n[0] === tag && (null == f || n[2] === f)));
    return dlog;
}
// Log non-fatal wierdness.
const dlog = getdlog('apidef', __filename);
function loadFile(path, what, fs, log) {
    try {
        const source = fs.readFileSync(path, 'utf8');
        return source;
    }
    catch (err) {
        log.error({ load: 'fail', what, path, err });
        throw err;
    }
}
function formatJsonSrc(jsonsrc) {
    return jsonsrc
        .replace(/"([a-zA-Z_][a-zA-Z_0-9]*)": /g, '$1: ')
        .replace(/},/g, '}\n')
        // .replace(/([a-zA-Z_][a-zA-Z_0-9]*)_COMMENT:/g, '# $1')
        .replace(/\n(\s*)([a-zA-Z_][a-zA-Z_0-9]*)_COMMENT:\s*"(.*)",/g, '\n\n$1# $2 $3');
}
function depluralize(word) {
    if (!word || word.length === 0) {
        return word;
    }
    // Common irregular plurals
    const irregulars = {
        'analytics': 'analytics',
        'analyses': 'analysis',
        'appendices': 'appendix',
        'axes': 'axis',
        'children': 'child',
        'courses': 'course',
        'crises': 'crisis',
        'criteria': 'criterion',
        // 'data': 'datum',
        'diagnoses': 'diagnosis',
        'feet': 'foot',
        'furnace': 'furnaces',
        'geese': 'goose',
        'horses': 'horse',
        'house': 'houses',
        'indices': 'index',
        'license': 'licenses',
        'matrices': 'matrix',
        'men': 'man',
        'mice': 'mouse',
        'notice': 'notices',
        'oases': 'oasis',
        'releases': 'release',
        'people': 'person',
        'phenomena': 'phenomenon',
        'practice': 'practices',
        'promise': 'promises',
        'teeth': 'tooth',
        'theses': 'thesis',
        'vertices': 'vertex',
        'women': 'woman',
    };
    if (irregulars[word]) {
        return irregulars[word];
    }
    for (let ending in irregulars) {
        if (word.endsWith(ending)) {
            return word.replace(ending, irregulars[ending]);
        }
    }
    // Rules for regular plurals (applied in order)
    if (word.endsWith('ies') && word.length > 3) {
        return word.slice(0, -3) + 'y';
    }
    // -ies -> -y (cities -> city)
    if (word.endsWith('ies') && word.length > 3) {
        return word.slice(0, -3) + 'y';
    }
    // -ves -> -f or -fe (wolves -> wolf, knives -> knife)
    if (word.endsWith('ves')) {
        const stem = word.slice(0, -3);
        // Check if it should be -fe (like knife, wife, life)
        if (['kni', 'wi', 'li'].includes(stem)) {
            return stem + 'fe';
        }
        return stem + 'f';
    }
    // -oes -> -o (potatoes -> potato)
    if (word.endsWith('oes')) {
        return word.slice(0, -2);
    }
    // Handle words ending in -nses (like responses, expenses, licenses)
    // These should only lose the final -s, not -es
    if (word.endsWith('nses')) {
        return word.slice(0, -1);
    }
    // -ses, -xes, -zes, -shes, -ches -> remove -es (boxes -> box)
    if (word.endsWith('ses') || word.endsWith('xes') || word.endsWith('zes') ||
        word.endsWith('shes') || word.endsWith('ches')) {
        return word.slice(0, -2);
    }
    // -s -> remove -s (cats -> cat)
    if (word.endsWith('s') && !word.endsWith('ss')) {
        return word.slice(0, -1);
    }
    // If none of the rules apply, return as is
    return word;
}
function find(obj, qkey) {
    let vals = [];
    (0, struct_1.walk)(obj, (key, val, _p, t) => {
        if (qkey === key) {
            vals.push({ key, val, path: t });
        }
        return val;
    });
    return vals;
}
function capture(data, shape) {
    let meta = { capture: {} };
    let errs = [];
    (0, struct_1.transform)(data, shape, {
        extra: {
            $CAPTURE,
            $APPEND,
            $ANY,
            $SELECT,
            $LOWER: $RECASE,
            $UPPER: $RECASE,
        },
        errs,
        meta
    });
    if (0 < errs.length) {
        console.log('ERRS', errs);
        dlog(errs);
    }
    return meta.capture;
}
function $CAPTURE(inj) {
    // Set prop foo with value at x: { x: { '`$CAPTURE`': 'foo' } }
    if ('key:pre' === inj.mode) {
        const { val, prior } = inj;
        const { dparent, key } = prior;
        const dval = dparent?.[key];
        if (undefined !== dval) {
            inj.meta.capture[val] = dval;
        }
    }
    // Use key x as prop name: { x: '`$CAPTURE`': }
    else if ('val' === inj.mode) {
        const { key, dparent } = inj;
        const dval = dparent?.[key];
        if (undefined !== dval) {
            inj.meta.capture[key] = dval;
        }
    }
}
function $APPEND(inj, val, ref, store) {
    // Set prop foo with value at x: { x: { '`$CAPTURE`': 'foo' } }
    if ('key:pre' === inj.mode) {
        const { val, prior } = inj;
        const { dparent, key } = prior;
        const dval = dparent?.[key];
        if (undefined !== dval) {
            inj.meta.capture[val] = (inj.meta.capture[val] || []);
            inj.meta.capture[val].push(dval);
        }
    }
    else if ('val' === inj.mode) {
        inj.keyI = inj.keys.length;
        const [_, prop, xform] = inj.parent;
        const { key, dparent } = inj.prior;
        const dval = dparent?.[key];
        const vstore = { ...store };
        vstore.$TOP = { [key]: dval };
        // const ptval = transform({ [key]: dval }, { [key]: xform }, {
        const ptval = (0, struct_1.inject)({ [key]: xform }, vstore, {
            meta: { ...inj.meta },
            errs: inj.errs,
        });
        const tval = ptval[key];
        if (undefined !== tval) {
            inj.meta.capture[prop] = (inj.meta.capture[prop] || []);
            inj.meta.capture[prop].push(tval);
        }
    }
}
function $ANY(inj, _val, _ref, store) {
    if ('key:pre' === inj.mode) {
        const { prior } = inj;
        const child = inj.parent[inj.key];
        const { dparent, key } = prior;
        const dval = dparent?.[key];
        if ((0, struct_1.isnode)(dval)) {
            for (let n of Object.entries(dval)) {
                let vstore = { ...store };
                vstore.$TOP = { [n[0]]: n[1] };
                (0, struct_1.inject)((0, struct_1.clone)({ [n[0]]: child }), vstore, {
                    meta: inj.meta,
                    errs: inj.errs,
                });
            }
        }
    }
}
function $SELECT(inj, _val, _ref, store) {
    if ('val' === inj.mode) {
        inj.keyI = inj.keys.length;
        let [_, selector, descendor] = inj.parent;
        const dparents = Object.entries(inj.dparent || {})
            .filter(n => (0, struct_1.isnode)(n[1]))
            .reduce((a, n) => (a[n[0]] = n[1], a), {});
        // console.log('SELECT-FROM', dparents)
        if (selector instanceof RegExp) {
            selector = {
                '$KEY': { '`$LIKE`': selector.toString() }
            };
        }
        // TODO: select should be safe for scalars
        const children = (0, struct_1.select)(dparents, selector);
        if (0 < children.length) {
            for (let child of children) {
                let vstore = { ...store };
                vstore.$TOP = { [child.$KEY]: child };
                (0, struct_1.inject)((0, struct_1.clone)({ [child.$KEY]: descendor }), vstore, {
                    meta: (0, struct_1.merge)([
                        inj.meta,
                        // TODO: need this hack as struct does not provide a way to get grandparent keys
                        // also, these capture actions are not preserving the path!
                        { select: { key: { [(0, struct_1.slice)(inj.path, 1, -1).join('+')]: child.$KEY } } }
                    ]),
                    errs: inj.errs,
                });
            }
        }
    }
}
function $RECASE(inj, val, ref, store) {
    if ('key:pre' === inj.mode) {
        const dval = inj.parent[inj.key];
        // TODO: handle paths more generally! use inj.prior?
        // TODO: mkae this into a utility method on inj?
        const dkey = inj.prior.key;
        const gkey = inj.prior.prior.key;
        const vstore = { ...store };
        vstore.$TOP = { [gkey]: { [dkey]: inj.dparent?.[dkey] } };
        const vspec = { [gkey]: { [dkey]: dval } };
        const ptval = (0, struct_1.inject)(vspec, vstore, {
            meta: { ...inj.meta },
            errs: inj.errs,
        });
        let tval = ptval[gkey][dkey];
        if ('string' === typeof tval) {
            tval = '$UPPER' === ref ? tval.toUpperCase() : tval.toLowerCase();
        }
        inj.setval(tval, 2);
    }
}
// A special-purpose regex-style matcher for url paths.
//   t - text part
//   p - param part
//   / - part separator
//   / at start - must match from start
//   / at end - must match to end
// See utility.test.ts for examples
function pathMatch(path, expr) {
    const parts = (Array.isArray(path) ? path : path.split('/')).filter(p => '' !== p);
    const res = [];
    res.index = -1;
    res.expr = expr;
    const plen = parts.length;
    const xlen = expr.length;
    // console.log('INIT', { plen, xlen })
    let xI = 0, pI = 0, mI = -1;
    for (; pI <= parts.length; pI++) {
        let p = parts[pI];
        let x = expr[xI];
        let isp = isParam(p);
        // console.log('START', { xI, x, pI, p, isp })
        if ('/' === x) {
            if (0 === xI) {
                if (0 === pI) {
                    mI = 0;
                    pI--;
                    xI++;
                }
                else {
                    break;
                }
            }
            else if (xI === xlen - 1) {
                if (pI === plen) {
                    xI++;
                    break;
                }
                else {
                    if (-1 < mI) {
                        // console.log('BACKTRACK-A')
                        // backtrack
                        pI = mI;
                        mI = -1;
                    }
                    xI = 0;
                }
            }
            else if (xI < xlen - 1) {
                pI--;
                xI++;
            }
            else {
                xI = 0;
                break;
            }
        }
        else if ('t' === x && !isp) {
            xI++;
            mI = mI < 0 ? pI : mI;
        }
        else if ('p' === x && isp) {
            xI++;
            mI = mI < 0 ? pI : mI;
        }
        else {
            if (-1 < mI) {
                // console.log('BACKTRACK-B')
                // backtrack
                pI = mI;
                mI = -1;
            }
            xI = 0;
        }
        // console.log('END', { xI, x, pI, p, isp })
        if (xI === xlen) {
            break;
        }
    }
    if (xI === xlen) {
        res.index = mI;
        res.push(...parts.slice(mI, pI + 1));
        return res;
    }
    return null;
}
function isParam(partStr) {
    return null != partStr && '{' === partStr[0] && '}' === partStr[partStr.length - 1];
}
//# sourceMappingURL=utility.js.map