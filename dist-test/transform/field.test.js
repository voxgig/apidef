"use strict";
/* Copyright (c) 2024-2025 Voxgig Ltd, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const code_1 = require("@hapi/code");
const field_1 = require("../../dist/transform/field");
(0, node_test_1.describe)('transform-field', () => {
    (0, node_test_1.test)('inferTypeFromValue', () => {
        (0, code_1.expect)((0, field_1.inferTypeFromValue)('hello')).equal('string');
        (0, code_1.expect)((0, field_1.inferTypeFromValue)('')).equal('string');
        (0, code_1.expect)((0, field_1.inferTypeFromValue)(true)).equal('boolean');
        (0, code_1.expect)((0, field_1.inferTypeFromValue)(false)).equal('boolean');
        (0, code_1.expect)((0, field_1.inferTypeFromValue)(42)).equal('integer');
        (0, code_1.expect)((0, field_1.inferTypeFromValue)(0)).equal('integer');
        (0, code_1.expect)((0, field_1.inferTypeFromValue)(-1)).equal('integer');
        (0, code_1.expect)((0, field_1.inferTypeFromValue)(3.14)).equal('number');
        (0, code_1.expect)((0, field_1.inferTypeFromValue)(0.5)).equal('number');
        (0, code_1.expect)((0, field_1.inferTypeFromValue)([1, 2])).equal('array');
        (0, code_1.expect)((0, field_1.inferTypeFromValue)([])).equal('array');
        (0, code_1.expect)((0, field_1.inferTypeFromValue)({ a: 1 })).equal('object');
        (0, code_1.expect)((0, field_1.inferTypeFromValue)({})).equal('object');
        (0, code_1.expect)((0, field_1.inferTypeFromValue)(null)).equal('string');
        (0, code_1.expect)((0, field_1.inferTypeFromValue)(undefined)).equal('string');
    });
    (0, node_test_1.test)('inferFieldsFromExamples - OpenAPI 3.x example object', () => {
        const opdef = {
            responses: {
                200: {
                    content: {
                        'application/json': {
                            example: {
                                id: 'abc-123',
                                name: 'Test Item',
                                count: 42,
                                price: 9.99,
                                active: true,
                                tags: ['a', 'b'],
                                meta: { key: 'val' },
                            }
                        }
                    }
                }
            }
        };
        const fields = (0, field_1.inferFieldsFromExamples)(opdef);
        (0, code_1.expect)(fields.length).equal(7);
        const byName = {};
        for (const f of fields) {
            byName[f.key$] = f;
        }
        (0, code_1.expect)(byName.id.type).equal('string');
        (0, code_1.expect)(byName.name.type).equal('string');
        (0, code_1.expect)(byName.count.type).equal('integer');
        (0, code_1.expect)(byName.price.type).equal('number');
        (0, code_1.expect)(byName.active.type).equal('boolean');
        (0, code_1.expect)(byName.tags.type).equal('array');
        (0, code_1.expect)(byName.meta.type).equal('object');
    });
    (0, node_test_1.test)('inferFieldsFromExamples - OpenAPI 3.x named examples', () => {
        const opdef = {
            responses: {
                200: {
                    content: {
                        'application/json': {
                            examples: {
                                'example1': {
                                    value: {
                                        id: 'x1',
                                        title: 'First',
                                        score: 88.5,
                                    }
                                },
                                'example2': {
                                    value: {
                                        id: 'x2',
                                        title: 'Second',
                                        score: 91.0,
                                    }
                                }
                            }
                        }
                    }
                }
            }
        };
        const fields = (0, field_1.inferFieldsFromExamples)(opdef);
        (0, code_1.expect)(fields.length).equal(3);
        const byName = {};
        for (const f of fields) {
            byName[f.key$] = f;
        }
        (0, code_1.expect)(byName.id.type).equal('string');
        (0, code_1.expect)(byName.title.type).equal('string');
        (0, code_1.expect)(byName.score.type).equal('number');
    });
    (0, node_test_1.test)('inferFieldsFromExamples - Swagger 2.0 schema example', () => {
        const opdef = {
            responses: {
                200: {
                    schema: {
                        example: {
                            username: 'admin',
                            email: 'admin@test.com',
                            is_active: true,
                            login_count: 5,
                        }
                    }
                }
            }
        };
        const fields = (0, field_1.inferFieldsFromExamples)(opdef);
        (0, code_1.expect)(fields.length).equal(4);
        const byName = {};
        for (const f of fields) {
            byName[f.key$] = f;
        }
        (0, code_1.expect)(byName.username.type).equal('string');
        (0, code_1.expect)(byName.email.type).equal('string');
        (0, code_1.expect)(byName.is_active.type).equal('boolean');
        (0, code_1.expect)(byName.login_count.type).equal('integer');
    });
    (0, node_test_1.test)('inferFieldsFromExamples - array example unwraps to first item', () => {
        const opdef = {
            responses: {
                200: {
                    content: {
                        'application/json': {
                            example: [
                                { id: 1, name: 'first' },
                                { id: 2, name: 'second' },
                            ]
                        }
                    }
                }
            }
        };
        const fields = (0, field_1.inferFieldsFromExamples)(opdef);
        (0, code_1.expect)(fields.length).equal(2);
        const byName = {};
        for (const f of fields) {
            byName[f.key$] = f;
        }
        (0, code_1.expect)(byName.id.type).equal('integer');
        (0, code_1.expect)(byName.name.type).equal('string');
    });
    (0, node_test_1.test)('inferFieldsFromExamples - no responses returns empty', () => {
        (0, code_1.expect)((0, field_1.inferFieldsFromExamples)({})).equal([]);
        (0, code_1.expect)((0, field_1.inferFieldsFromExamples)({ responses: {} })).equal([]);
        (0, code_1.expect)((0, field_1.inferFieldsFromExamples)({ responses: { 404: {} } })).equal([]);
    });
    (0, node_test_1.test)('inferFieldsFromExamples - 201 response', () => {
        const opdef = {
            responses: {
                201: {
                    content: {
                        'application/json': {
                            example: {
                                id: 'new-1',
                                created: true,
                            }
                        }
                    }
                }
            }
        };
        const fields = (0, field_1.inferFieldsFromExamples)(opdef);
        (0, code_1.expect)(fields.length).equal(2);
        const byName = {};
        for (const f of fields) {
            byName[f.key$] = f;
        }
        (0, code_1.expect)(byName.id.type).equal('string');
        (0, code_1.expect)(byName.created.type).equal('boolean');
    });
    (0, node_test_1.test)('inferFieldsFromExamples - Swagger 2.0 examples with media type', () => {
        const opdef = {
            responses: {
                200: {
                    examples: {
                        'application/json': {
                            status: 'ok',
                            version: 2,
                        }
                    }
                }
            }
        };
        const fields = (0, field_1.inferFieldsFromExamples)(opdef);
        (0, code_1.expect)(fields.length).equal(2);
        const byName = {};
        for (const f of fields) {
            byName[f.key$] = f;
        }
        (0, code_1.expect)(byName.status.type).equal('string');
        (0, code_1.expect)(byName.version.type).equal('integer');
    });
});
//# sourceMappingURL=field.test.js.map