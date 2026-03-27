"use strict";
/* Copyright (c) 2024-2025 Voxgig Ltd, MIT License */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const Fs = __importStar(require("node:fs"));
const Path = __importStar(require("node:path"));
const node_test_1 = require("node:test");
const node_assert_1 = __importDefault(require("node:assert"));
const utility_1 = require("../dist/utility");
const field_1 = require("../dist/transform/field");
const parse_1 = require("../dist/parse");
const clean_1 = require("../dist/transform/clean");
const transform_1 = require("../dist/transform");
function loadTsv(name) {
    const filepath = Path.join(__dirname, '..', 'test', name + '.tsv');
    const text = Fs.readFileSync(filepath, 'utf8');
    const lines = text.split('\n').filter(line => line.trim() !== '');
    const headers = lines[0].split('\t');
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split('\t');
        const row = {};
        for (let j = 0; j < headers.length; j++) {
            row[headers[j]] = cols[j] ?? '';
        }
        rows.push(row);
    }
    return rows;
}
(0, node_test_1.describe)('tsv-depluralize', () => {
    const rows = loadTsv('depluralize');
    for (const row of rows) {
        (0, node_test_1.test)(`depluralize("${row.input}") => "${row.expected}"`, () => {
            node_assert_1.default.deepStrictEqual((0, utility_1.depluralize)(row.input), row.expected);
        });
    }
});
(0, node_test_1.describe)('tsv-canonize', () => {
    const rows = loadTsv('canonize');
    for (const row of rows) {
        (0, node_test_1.test)(`canonize("${row.input}") => "${row.expected}"`, () => {
            node_assert_1.default.deepStrictEqual((0, utility_1.canonize)(row.input), row.expected);
        });
    }
});
(0, node_test_1.describe)('tsv-sanitize-slug', () => {
    const rows = loadTsv('sanitize-slug');
    for (const row of rows) {
        (0, node_test_1.test)(`sanitizeSlug("${row.input}") => "${row.expected}"`, () => {
            node_assert_1.default.deepStrictEqual((0, utility_1.sanitizeSlug)(row.input), row.expected);
        });
    }
});
(0, node_test_1.describe)('tsv-slug-to-pascal', () => {
    const rows = loadTsv('slug-to-pascal');
    for (const row of rows) {
        (0, node_test_1.test)(`slugToPascalCase("${row.input}") => "${row.expected}"`, () => {
            node_assert_1.default.deepStrictEqual((0, utility_1.slugToPascalCase)(row.input), row.expected);
        });
    }
});
(0, node_test_1.describe)('tsv-transliterate', () => {
    const rows = loadTsv('transliterate');
    for (const row of rows) {
        (0, node_test_1.test)(`transliterate("${row.input}") => "${row.expected}"`, () => {
            node_assert_1.default.deepStrictEqual((0, utility_1.transliterate)(row.input), row.expected);
        });
    }
});
(0, node_test_1.describe)('tsv-normalize-field-name', () => {
    const rows = loadTsv('normalize-field-name');
    for (const row of rows) {
        (0, node_test_1.test)(`normalizeFieldName("${row.input}") => "${row.expected}"`, () => {
            node_assert_1.default.deepStrictEqual((0, utility_1.normalizeFieldName)(row.input), row.expected);
        });
    }
});
(0, node_test_1.describe)('tsv-clean-component-name', () => {
    const rows = loadTsv('clean-component-name');
    for (const row of rows) {
        (0, node_test_1.test)(`cleanComponentName("${row.input}") => "${row.expected}"`, () => {
            node_assert_1.default.deepStrictEqual((0, utility_1.cleanComponentName)(row.input), row.expected);
        });
    }
});
(0, node_test_1.describe)('tsv-infer-field-type', () => {
    const rows = loadTsv('infer-field-type');
    for (const row of rows) {
        (0, node_test_1.test)(`inferFieldType("${row.name}", "${row.specType}") => "${row.expected}"`, () => {
            node_assert_1.default.deepStrictEqual((0, utility_1.inferFieldType)(row.name, row.specType), row.expected);
        });
    }
});
(0, node_test_1.describe)('tsv-validator', () => {
    const rows = loadTsv('validator');
    for (const row of rows) {
        (0, node_test_1.test)(`validator("${row.input}") => "${row.expected}"`, () => {
            node_assert_1.default.deepStrictEqual((0, utility_1.validator)(row.input), row.expected);
        });
    }
});
(0, node_test_1.describe)('tsv-infer-type-from-value', () => {
    const rows = loadTsv('infer-type-from-value');
    for (const row of rows) {
        (0, node_test_1.test)(`inferTypeFromValue(${row.input}) => "${row.expected}"`, () => {
            let input;
            if (row.input === 'null') {
                input = null;
            }
            else if (row.input === 'true') {
                input = true;
            }
            else if (row.input === 'false') {
                input = false;
            }
            else {
                input = JSON.parse(row.input);
            }
            node_assert_1.default.deepStrictEqual((0, field_1.inferTypeFromValue)(input), row.expected);
        });
    }
});
(0, node_test_1.describe)('tsv-ensure-min-entity-name', () => {
    const rows = loadTsv('ensure-min-entity-name');
    for (const row of rows) {
        (0, node_test_1.test)(`ensureMinEntityName("${row.input}") => "${row.expected}"`, () => {
            node_assert_1.default.deepStrictEqual((0, utility_1.ensureMinEntityName)(row.input, {}), row.expected);
        });
    }
});
(0, node_test_1.describe)('tsv-nom', () => {
    const rows = loadTsv('nom');
    for (const row of rows) {
        (0, node_test_1.test)(`nom(${row.object}, "${row.format}") => "${row.expected}"`, () => {
            const obj = JSON.parse(row.object);
            node_assert_1.default.deepStrictEqual((0, utility_1.nom)(obj, row.format), row.expected);
        });
    }
});
(0, node_test_1.describe)('tsv-format-json-src', () => {
    const rows = loadTsv('format-json-src');
    for (const row of rows) {
        (0, node_test_1.test)(`formatJsonSrc(${JSON.stringify(row.input)})`, () => {
            node_assert_1.default.deepStrictEqual((0, utility_1.formatJsonSrc)(row.input), row.expected);
        });
    }
});
(0, node_test_1.describe)('tsv-parse-errors', () => {
    const rows = loadTsv('parse-errors');
    for (const row of rows) {
        (0, node_test_1.test)(`parse("${row.kind}", ...) rejects /${row.errorPattern}/`, async () => {
            const source = row.source;
            const pm = { file: 'test-file' };
            const pattern = new RegExp(row.errorPattern);
            await node_assert_1.default.rejects((0, parse_1.parse)(row.kind, source, pm), pattern);
        });
    }
    (0, node_test_1.test)('parse rejects undefined source with /string/', async () => {
        const pm = { file: 'test-file' };
        await node_assert_1.default.rejects((0, parse_1.parse)('OpenAPI', undefined, pm), /string/);
    });
    (0, node_test_1.test)('parse rejects multi-line YAML comments with /empty/', async () => {
        const pm = { file: 'test-file' };
        await node_assert_1.default.rejects((0, parse_1.parse)('OpenAPI', '# comment 1\n# comment 2', pm), /empty/);
    });
    (0, node_test_1.test)('parse rejects YAML syntax error with /syntax/', async () => {
        const pm = { file: 'test-file' };
        await node_assert_1.default.rejects((0, parse_1.parse)('OpenAPI', 'openapi: 3.0.0\na::1', pm), /syntax/);
    });
});
(0, node_test_1.describe)('tsv-fixName', () => {
    (0, node_test_1.test)('fixName sets lowercase, camelCase, and UPPERCASE', () => {
        const base = {};
        (0, transform_1.fixName)(base, 'planet');
        node_assert_1.default.deepStrictEqual(base.name, 'planet');
        node_assert_1.default.deepStrictEqual(base.Name, 'Planet');
        node_assert_1.default.deepStrictEqual(base.NAME, 'PLANET');
    });
    (0, node_test_1.test)('fixName with custom prop', () => {
        const base = {};
        (0, transform_1.fixName)(base, 'moon', 'entity');
        node_assert_1.default.deepStrictEqual(base.entity, 'moon');
        node_assert_1.default.deepStrictEqual(base.Entity, 'Moon');
        node_assert_1.default.deepStrictEqual(base.ENTITY, 'MOON');
    });
    (0, node_test_1.test)('fixName with null base does not throw', () => {
        (0, transform_1.fixName)(null, 'test');
        (0, transform_1.fixName)(undefined, 'test');
    });
});
(0, node_test_1.describe)('tsv-GuideShape', () => {
    (0, node_test_1.test)('GuideShape validates default structure', () => {
        const result = (0, transform_1.GuideShape)({
            entity: { foo: {} },
            control: {},
            transform: {},
            manual: {},
        });
        node_assert_1.default.deepStrictEqual(result.entity.foo, {});
    });
});
(0, node_test_1.describe)('tsv-cleanTransform-extended', () => {
    (0, node_test_1.test)('removes nested empty objects', async () => {
        const ctx = {
            apimodel: {
                a: { b: { c: {} } },
                d: { e: 1 },
            }
        };
        await (0, clean_1.cleanTransform)(ctx);
        node_assert_1.default.deepStrictEqual(ctx.apimodel.d, { e: 1 });
        node_assert_1.default.strictEqual(ctx.apimodel.a, undefined);
    });
    (0, node_test_1.test)('removes undefined values', async () => {
        const ctx = {
            apimodel: {
                a: { x: undefined, y: 1 },
            }
        };
        await (0, clean_1.cleanTransform)(ctx);
        node_assert_1.default.deepStrictEqual(ctx.apimodel, { a: { y: 1 } });
    });
    (0, node_test_1.test)('removes $ suffixed keys', async () => {
        const ctx = {
            apimodel: {
                good: { x: 1 },
                bad$: { x: 2 },
                paths$: [{ a: 1 }],
            }
        };
        await (0, clean_1.cleanTransform)(ctx);
        node_assert_1.default.strictEqual(ctx.apimodel.bad$, undefined);
        node_assert_1.default.strictEqual(ctx.apimodel.paths$, undefined);
        node_assert_1.default.deepStrictEqual(ctx.apimodel.good, { x: 1 });
    });
    (0, node_test_1.test)('preserves non-empty arrays', async () => {
        const ctx = {
            apimodel: {
                items: [1, 2, 3],
                nested: { arr: [{ x: 1 }] },
            }
        };
        await (0, clean_1.cleanTransform)(ctx);
        node_assert_1.default.deepStrictEqual(ctx.apimodel.items, [1, 2, 3]);
        node_assert_1.default.deepStrictEqual(ctx.apimodel.nested.arr, [{ x: 1 }]);
    });
});
(0, node_test_1.describe)('tsv-getModelPath-extended', () => {
    (0, node_test_1.test)('deep nested access', () => {
        const model = { a: { b: { c: { d: { e: 42 } } } } };
        const [v] = [(0, utility_1.getModelPath)(model, 'a.b.c.d.e')];
        node_assert_1.default.deepStrictEqual(v, 42);
    });
    (0, node_test_1.test)('array value access', () => {
        const model = { items: [10, 20, 30] };
        const v = (0, utility_1.getModelPath)(model, 'items');
        node_assert_1.default.deepStrictEqual(v, [10, 20, 30]);
    });
    (0, node_test_1.test)('boolean and falsy values', () => {
        const model = { a: { zero: 0, empty: '', flag: false } };
        node_assert_1.default.deepStrictEqual((0, utility_1.getModelPath)(model, 'a.zero'), 0);
        node_assert_1.default.deepStrictEqual((0, utility_1.getModelPath)(model, 'a.empty'), '');
        node_assert_1.default.deepStrictEqual((0, utility_1.getModelPath)(model, 'a.flag'), false);
    });
    (0, node_test_1.test)('required false returns undefined for missing', () => {
        const model = { a: 1 };
        node_assert_1.default.deepStrictEqual((0, utility_1.getModelPath)(model, 'b.c', { required: false }), undefined);
    });
    (0, node_test_1.test)('active filtering', () => {
        const model = {
            items: {
                a: { name: 'a', active: true },
                b: { name: 'b', active: false },
                c: { name: 'c', active: true },
            }
        };
        const v = (0, utility_1.getModelPath)(model, 'items');
        node_assert_1.default.strictEqual(v.b, undefined);
        node_assert_1.default.deepStrictEqual(v.a.name, 'a');
        node_assert_1.default.deepStrictEqual(v.c.name, 'c');
    });
});
//# sourceMappingURL=tsv.test.js.map