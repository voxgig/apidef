"use strict";
/* Copyright (c) 2024-2025 Voxgig Ltd, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const code_1 = require("@hapi/code");
const jostraca_1 = require("jostraca");
const utility_1 = require("../dist/utility");
(0, node_test_1.describe)('utility', () => {
    (0, node_test_1.test)('depluralize', () => {
        (0, code_1.expect)((0, utility_1.depluralize)('Dogs')).equal('Dog');
        (0, code_1.expect)((0, utility_1.depluralize)('countries')).equal('country');
        (0, code_1.expect)((0, utility_1.depluralize)('good_dogs')).equal('good_dog');
        (0, code_1.expect)((0, utility_1.depluralize)('many_countries')).equal('many_country');
        (0, code_1.expect)((0, utility_1.depluralize)('mice')).equal('mouse');
        (0, code_1.expect)((0, utility_1.depluralize)('many_mice')).equal('many_mouse');
        (0, code_1.expect)((0, utility_1.depluralize)('api_key')).equal('api_key');
        (0, code_1.expect)((0, utility_1.depluralize)('api_keys')).equal('api_key');
        (0, code_1.expect)((0, utility_1.depluralize)('ApiKeys')).equal('ApiKey');
        (0, code_1.expect)((0, utility_1.depluralize)('API_Keys')).equal('API_Key');
        // Words where -ies is part of the base form, not a plural suffix
        (0, code_1.expect)((0, utility_1.depluralize)('species')).equal('species');
        (0, code_1.expect)((0, utility_1.depluralize)('series')).equal('series');
        (0, code_1.expect)((0, utility_1.depluralize)('movies')).equal('movie');
        (0, code_1.expect)((0, utility_1.depluralize)('amiiboseries')).equal('amiiboseries');
        // Words that should not be truncated to <= 2 chars
        (0, code_1.expect)((0, utility_1.depluralize)('yes')).equal('yes');
        (0, code_1.expect)((0, utility_1.depluralize)('lens')).equal('lens');
        (0, code_1.expect)((0, utility_1.depluralize)('phrase')).equal('phrase');
        (0, code_1.expect)((0, utility_1.depluralize)('abs')).equal('abs');
    });
    (0, node_test_1.test)('canonize', () => {
        // Basic canonization
        (0, code_1.expect)((0, utility_1.canonize)('Dogs')).equal('dog');
        (0, code_1.expect)((0, utility_1.canonize)('FooBar')).equal('foo_bar');
        (0, code_1.expect)((0, utility_1.canonize)('my-thing')).equal('my_thing');
        // File extensions are stripped
        (0, code_1.expect)((0, utility_1.canonize)('categories.php')).equal('category');
        (0, code_1.expect)((0, utility_1.canonize)('search.php')).equal('search');
        (0, code_1.expect)((0, utility_1.canonize)('data.json')).equal('data');
        (0, code_1.expect)((0, utility_1.canonize)('region.json')).equal('region');
        (0, code_1.expect)((0, utility_1.canonize)('list.txt')).equal('list');
        (0, code_1.expect)((0, utility_1.canonize)('height.jpg')).equal('height');
        (0, code_1.expect)((0, utility_1.canonize)('location.png')).equal('location');
        (0, code_1.expect)((0, utility_1.canonize)('robots.txt')).equal('robot');
        (0, code_1.expect)((0, utility_1.canonize)('config.yaml')).equal('config');
        (0, code_1.expect)((0, utility_1.canonize)('schema.xml')).equal('schema');
        // Extensions are case-insensitive
        (0, code_1.expect)((0, utility_1.canonize)('data.JSON')).equal('data');
        (0, code_1.expect)((0, utility_1.canonize)('page.PHP')).equal('page');
        // Non-extension dots are not matched (no known extension)
        (0, code_1.expect)((0, utility_1.canonize)('v2.0')).equal('v20');
        // Extension only stripped at end
        (0, code_1.expect)((0, utility_1.canonize)('json_data')).equal('json_data');
        (0, code_1.expect)((0, utility_1.canonize)('php_version')).equal('php_version');
        // Accented characters are transliterated
        (0, code_1.expect)((0, utility_1.canonize)('dólar')).equal('dolar');
        (0, code_1.expect)((0, utility_1.canonize)('kölner')).equal('kolner');
        (0, code_1.expect)((0, utility_1.canonize)('pokémon')).equal('pokemon');
        (0, code_1.expect)((0, utility_1.canonize)('café')).equal('cafe');
        (0, code_1.expect)((0, utility_1.canonize)('naïve')).equal('naive');
        (0, code_1.expect)((0, utility_1.canonize)('über')).equal('uber');
        (0, code_1.expect)((0, utility_1.canonize)('résumé')).equal('resume');
        (0, code_1.expect)((0, utility_1.canonize)('señor')).equal('senor');
        // Non-Latin chars are stripped (no transliteration)
        (0, code_1.expect)((0, utility_1.canonize)('api検索')).equal('api');
        (0, code_1.expect)((0, utility_1.canonize)('会議録')).equal('');
    });
    (0, node_test_1.test)('transliterate', () => {
        // Latin diacritics are decomposed
        (0, code_1.expect)((0, utility_1.transliterate)('dólar')).equal('dolar');
        (0, code_1.expect)((0, utility_1.transliterate)('kölner')).equal('kolner');
        (0, code_1.expect)((0, utility_1.transliterate)('pokémon')).equal('pokemon');
        (0, code_1.expect)((0, utility_1.transliterate)('résumé')).equal('resume');
        (0, code_1.expect)((0, utility_1.transliterate)('naïve')).equal('naive');
        (0, code_1.expect)((0, utility_1.transliterate)('über')).equal('uber');
        (0, code_1.expect)((0, utility_1.transliterate)('señor')).equal('senor');
        (0, code_1.expect)((0, utility_1.transliterate)('café')).equal('cafe');
        (0, code_1.expect)((0, utility_1.transliterate)('Ångström')).equal('Angstrom');
        // ASCII unchanged
        (0, code_1.expect)((0, utility_1.transliterate)('hello')).equal('hello');
        (0, code_1.expect)((0, utility_1.transliterate)('foo-bar_123')).equal('foo-bar_123');
        // Non-Latin scripts pass through (stripped later by canonize)
        (0, code_1.expect)((0, utility_1.transliterate)('会議録')).equal('会議録');
        (0, code_1.expect)((0, utility_1.transliterate)('api検索')).equal('api検索');
    });
    (0, node_test_1.test)('normalizeFieldName', () => {
        // Bracket notation becomes underscores
        (0, code_1.expect)((0, utility_1.normalizeFieldName)('filter[text]')).equal('filter_text');
        (0, code_1.expect)((0, utility_1.normalizeFieldName)('page[limit]')).equal('page_limit');
        (0, code_1.expect)((0, utility_1.normalizeFieldName)('page[offset]')).equal('page_offset');
        // Nested brackets
        (0, code_1.expect)((0, utility_1.normalizeFieldName)('conditions[publication_date][gte]')).equal('conditions_publication_date_gte');
        // Trailing empty brackets are stripped
        (0, code_1.expect)((0, utility_1.normalizeFieldName)('fields[]')).equal('fields');
        (0, code_1.expect)((0, utility_1.normalizeFieldName)('conditions[agencies][]')).equal('conditions_agencies');
        (0, code_1.expect)((0, utility_1.normalizeFieldName)('conditions[type][]')).equal('conditions_type');
        // Dot notation becomes underscores
        (0, code_1.expect)((0, utility_1.normalizeFieldName)('facet.field')).equal('facet_field');
        (0, code_1.expect)((0, utility_1.normalizeFieldName)('refine.country')).equal('refine_country');
        // Regular names unchanged
        (0, code_1.expect)((0, utility_1.normalizeFieldName)('name')).equal('name');
        (0, code_1.expect)((0, utility_1.normalizeFieldName)('created_at')).equal('created_at');
        // Empty/null
        (0, code_1.expect)((0, utility_1.normalizeFieldName)('')).equal('');
        // No duplicate or leading/trailing underscores
        (0, code_1.expect)((0, utility_1.normalizeFieldName)('[foo]')).equal('foo');
        (0, code_1.expect)((0, utility_1.normalizeFieldName)('a..b')).equal('a_b');
    });
    (0, node_test_1.test)('normalizeFieldName with canonize (field pipeline)', () => {
        // Bracket notation: full field name pipeline as used in resolveOpFields
        (0, code_1.expect)((0, utility_1.canonize)((0, utility_1.normalizeFieldName)('filter[text]'))).equal('filter_text');
        (0, code_1.expect)((0, utility_1.canonize)((0, utility_1.normalizeFieldName)('page[limit]'))).equal('page_limit');
        (0, code_1.expect)((0, utility_1.canonize)((0, utility_1.normalizeFieldName)('page[offset]'))).equal('page_offset');
        // Nested brackets
        (0, code_1.expect)((0, utility_1.canonize)((0, utility_1.normalizeFieldName)('conditions[agencies][]'))).equal('conditions_agency');
        (0, code_1.expect)((0, utility_1.canonize)((0, utility_1.normalizeFieldName)('conditions[publication_date][gte]'))).equal('conditions_publication_date_gte');
        (0, code_1.expect)((0, utility_1.canonize)((0, utility_1.normalizeFieldName)('conditions[type][]'))).equal('conditions_type');
        (0, code_1.expect)((0, utility_1.canonize)((0, utility_1.normalizeFieldName)('fields[]'))).equal('field');
        // Dot notation
        (0, code_1.expect)((0, utility_1.canonize)((0, utility_1.normalizeFieldName)('facet.field'))).equal('facet_field');
        (0, code_1.expect)((0, utility_1.canonize)((0, utility_1.normalizeFieldName)('refine.country'))).equal('refine_country');
        (0, code_1.expect)((0, utility_1.canonize)((0, utility_1.normalizeFieldName)('refine.type'))).equal('refine_type');
        // Regular names pass through normally
        (0, code_1.expect)((0, utility_1.canonize)((0, utility_1.normalizeFieldName)('created_at'))).equal('created_at');
        (0, code_1.expect)((0, utility_1.canonize)((0, utility_1.normalizeFieldName)('UserName'))).equal('user_name');
    });
    (0, node_test_1.test)('normalizeFieldName with snakify (arg pipeline)', () => {
        // Bracket notation: arg name pipeline as used in resolveArgs
        const argPipeline = (s) => (0, utility_1.depluralize)((0, jostraca_1.snakify)((0, utility_1.normalizeFieldName)(s)));
        (0, code_1.expect)(argPipeline('filter[text]')).equal('filter_text');
        (0, code_1.expect)(argPipeline('page[limit]')).equal('page_limit');
        (0, code_1.expect)(argPipeline('filter[route]')).equal('filter_route');
        // Nested brackets
        (0, code_1.expect)(argPipeline('conditions[agencies][]')).equal('conditions_agency');
        (0, code_1.expect)(argPipeline('conditions[publication_date][gte]')).equal('conditions_publication_date_gte');
        // Dot notation
        (0, code_1.expect)(argPipeline('facet.field')).equal('facet_field');
        (0, code_1.expect)(argPipeline('refine.country')).equal('refine_country');
        // CamelCase args
        (0, code_1.expect)(argPipeline('filterText')).equal('filter_text');
        (0, code_1.expect)(argPipeline('pageLimit')).equal('page_limit');
        // Regular args unchanged
        (0, code_1.expect)(argPipeline('sort')).equal('sort');
        (0, code_1.expect)(argPipeline('include')).equal('include');
    });
    (0, node_test_1.test)('inferFieldType', () => {
        // Boolean patterns: $ANY -> $BOOLEAN
        (0, code_1.expect)((0, utility_1.inferFieldType)('is_blocked', '`$ANY`')).equal('`$BOOLEAN`');
        (0, code_1.expect)((0, utility_1.inferFieldType)('has_homepage', '`$ANY`')).equal('`$BOOLEAN`');
        (0, code_1.expect)((0, utility_1.inferFieldType)('can_edit', '`$ANY`')).equal('`$BOOLEAN`');
        (0, code_1.expect)((0, utility_1.inferFieldType)('should_notify', '`$ANY`')).equal('`$BOOLEAN`');
        (0, code_1.expect)((0, utility_1.inferFieldType)('allow_merge', '`$ANY`')).equal('`$BOOLEAN`');
        (0, code_1.expect)((0, utility_1.inferFieldType)('enabled', '`$ANY`')).equal('`$BOOLEAN`');
        (0, code_1.expect)((0, utility_1.inferFieldType)('disabled', '`$ANY`')).equal('`$BOOLEAN`');
        (0, code_1.expect)((0, utility_1.inferFieldType)('active', '`$ANY`')).equal('`$BOOLEAN`');
        (0, code_1.expect)((0, utility_1.inferFieldType)('visible', '`$ANY`')).equal('`$BOOLEAN`');
        (0, code_1.expect)((0, utility_1.inferFieldType)('deleted', '`$ANY`')).equal('`$BOOLEAN`');
        (0, code_1.expect)((0, utility_1.inferFieldType)('verified', '`$ANY`')).equal('`$BOOLEAN`');
        (0, code_1.expect)((0, utility_1.inferFieldType)('locked', '`$ANY`')).equal('`$BOOLEAN`');
        (0, code_1.expect)((0, utility_1.inferFieldType)('archived', '`$ANY`')).equal('`$BOOLEAN`');
        (0, code_1.expect)((0, utility_1.inferFieldType)('blocked', '`$ANY`')).equal('`$BOOLEAN`');
        // Boolean patterns: $STRING -> $BOOLEAN
        (0, code_1.expect)((0, utility_1.inferFieldType)('is_blocked', '`$STRING`')).equal('`$BOOLEAN`');
        (0, code_1.expect)((0, utility_1.inferFieldType)('has_homepage', '`$STRING`')).equal('`$BOOLEAN`');
        (0, code_1.expect)((0, utility_1.inferFieldType)('is_smartlink', '`$STRING`')).equal('`$BOOLEAN`');
        (0, code_1.expect)((0, utility_1.inferFieldType)('active', '`$STRING`')).equal('`$BOOLEAN`');
        // $STRING not overridden for non-boolean patterns
        (0, code_1.expect)((0, utility_1.inferFieldType)('name', '`$STRING`')).equal('`$STRING`');
        (0, code_1.expect)((0, utility_1.inferFieldType)('total_count', '`$STRING`')).equal('`$STRING`');
        // ID patterns: $ANY -> $STRING
        (0, code_1.expect)((0, utility_1.inferFieldType)('id', '`$ANY`')).equal('`$STRING`');
        (0, code_1.expect)((0, utility_1.inferFieldType)('user_id', '`$ANY`')).equal('`$STRING`');
        (0, code_1.expect)((0, utility_1.inferFieldType)('project_id', '`$ANY`')).equal('`$STRING`');
        // Integer patterns: $ANY -> $INTEGER
        (0, code_1.expect)((0, utility_1.inferFieldType)('total_count', '`$ANY`')).equal('`$INTEGER`');
        (0, code_1.expect)((0, utility_1.inferFieldType)('item_count', '`$ANY`')).equal('`$INTEGER`');
        (0, code_1.expect)((0, utility_1.inferFieldType)('page_number', '`$ANY`')).equal('`$INTEGER`');
        (0, code_1.expect)((0, utility_1.inferFieldType)('limit', '`$ANY`')).equal('`$INTEGER`');
        (0, code_1.expect)((0, utility_1.inferFieldType)('page', '`$ANY`')).equal('`$INTEGER`');
        (0, code_1.expect)((0, utility_1.inferFieldType)('offset', '`$ANY`')).equal('`$INTEGER`');
        (0, code_1.expect)((0, utility_1.inferFieldType)('per_page', '`$ANY`')).equal('`$INTEGER`');
        (0, code_1.expect)((0, utility_1.inferFieldType)('page_size', '`$ANY`')).equal('`$INTEGER`');
        (0, code_1.expect)((0, utility_1.inferFieldType)('size', '`$ANY`')).equal('`$INTEGER`');
        (0, code_1.expect)((0, utility_1.inferFieldType)('skip', '`$ANY`')).equal('`$INTEGER`');
        (0, code_1.expect)((0, utility_1.inferFieldType)('num_item', '`$ANY`')).equal('`$INTEGER`');
        // Number patterns: $ANY -> $NUMBER
        (0, code_1.expect)((0, utility_1.inferFieldType)('latitude', '`$ANY`')).equal('`$NUMBER`');
        (0, code_1.expect)((0, utility_1.inferFieldType)('longitude', '`$ANY`')).equal('`$NUMBER`');
        (0, code_1.expect)((0, utility_1.inferFieldType)('lat', '`$ANY`')).equal('`$NUMBER`');
        (0, code_1.expect)((0, utility_1.inferFieldType)('lng', '`$ANY`')).equal('`$NUMBER`');
        (0, code_1.expect)((0, utility_1.inferFieldType)('price', '`$ANY`')).equal('`$NUMBER`');
        (0, code_1.expect)((0, utility_1.inferFieldType)('amount', '`$ANY`')).equal('`$NUMBER`');
        (0, code_1.expect)((0, utility_1.inferFieldType)('score', '`$ANY`')).equal('`$NUMBER`');
        (0, code_1.expect)((0, utility_1.inferFieldType)('weight', '`$ANY`')).equal('`$NUMBER`');
        (0, code_1.expect)((0, utility_1.inferFieldType)('radius', '`$ANY`')).equal('`$NUMBER`');
        (0, code_1.expect)((0, utility_1.inferFieldType)('distance', '`$ANY`')).equal('`$NUMBER`');
        (0, code_1.expect)((0, utility_1.inferFieldType)('percentage', '`$ANY`')).equal('`$NUMBER`');
        // String patterns: $ANY -> $STRING
        (0, code_1.expect)((0, utility_1.inferFieldType)('url', '`$ANY`')).equal('`$STRING`');
        (0, code_1.expect)((0, utility_1.inferFieldType)('href', '`$ANY`')).equal('`$STRING`');
        (0, code_1.expect)((0, utility_1.inferFieldType)('email', '`$ANY`')).equal('`$STRING`');
        (0, code_1.expect)((0, utility_1.inferFieldType)('name', '`$ANY`')).equal('`$STRING`');
        (0, code_1.expect)((0, utility_1.inferFieldType)('title', '`$ANY`')).equal('`$STRING`');
        (0, code_1.expect)((0, utility_1.inferFieldType)('description', '`$ANY`')).equal('`$STRING`');
        (0, code_1.expect)((0, utility_1.inferFieldType)('slug', '`$ANY`')).equal('`$STRING`');
        (0, code_1.expect)((0, utility_1.inferFieldType)('token', '`$ANY`')).equal('`$STRING`');
        // Specific types from spec are not overridden
        (0, code_1.expect)((0, utility_1.inferFieldType)('latitude', '`$STRING`')).equal('`$STRING`');
        (0, code_1.expect)((0, utility_1.inferFieldType)('limit', '`$INTEGER`')).equal('`$INTEGER`');
        (0, code_1.expect)((0, utility_1.inferFieldType)('id', '`$INTEGER`')).equal('`$INTEGER`');
        (0, code_1.expect)((0, utility_1.inferFieldType)('price', '`$NUMBER`')).equal('`$NUMBER`');
        (0, code_1.expect)((0, utility_1.inferFieldType)('is_active', '`$BOOLEAN`')).equal('`$BOOLEAN`');
        // Unknown field names with $ANY stay $ANY
        (0, code_1.expect)((0, utility_1.inferFieldType)('data', '`$ANY`')).equal('`$ANY`');
        (0, code_1.expect)((0, utility_1.inferFieldType)('result', '`$ANY`')).equal('`$ANY`');
        (0, code_1.expect)((0, utility_1.inferFieldType)('custom_field', '`$ANY`')).equal('`$ANY`');
        // Names that look similar but should not be overridden
        (0, code_1.expect)((0, utility_1.inferFieldType)('disable_reason', '`$STRING`')).equal('`$STRING`');
        (0, code_1.expect)((0, utility_1.inferFieldType)('disable_reason', '`$ANY`')).equal('`$ANY`');
        (0, code_1.expect)((0, utility_1.inferFieldType)('activation_code', '`$ANY`')).equal('`$ANY`');
        (0, code_1.expect)((0, utility_1.inferFieldType)('page_title', '`$ANY`')).equal('`$ANY`');
    });
    (0, node_test_1.test)('cleanComponentName', () => {
        // Controller suffixes are stripped
        (0, code_1.expect)((0, utility_1.cleanComponentName)('nps_controller')).equal('nps');
        (0, code_1.expect)((0, utility_1.cleanComponentName)('balance_controller')).equal('balance');
        (0, code_1.expect)((0, utility_1.cleanComponentName)('gas_system_controller')).equal('gas_system');
        // Rest controller suffix (two parts) is stripped
        (0, code_1.expect)((0, utility_1.cleanComponentName)('donate_rest_controller')).equal('donate');
        (0, code_1.expect)((0, utility_1.cleanComponentName)('portfolio_rest_controller')).equal('portfolio');
        // Response/request suffixes are stripped
        (0, code_1.expect)((0, utility_1.cleanComponentName)('user_response')).equal('user');
        (0, code_1.expect)((0, utility_1.cleanComponentName)('order_request')).equal('order');
        // HTTP verb prefixes are stripped
        (0, code_1.expect)((0, utility_1.cleanComponentName)('get_account_lookup')).equal('account_lookup');
        (0, code_1.expect)((0, utility_1.cleanComponentName)('post_transfer')).equal('transfer');
        (0, code_1.expect)((0, utility_1.cleanComponentName)('put_setting')).equal('setting');
        (0, code_1.expect)((0, utility_1.cleanComponentName)('delete_item')).equal('item');
        (0, code_1.expect)((0, utility_1.cleanComponentName)('patch_record')).equal('record');
        // Verb prefix not stripped if remainder is too short
        (0, code_1.expect)((0, utility_1.cleanComponentName)('get_ab')).equal('get_ab');
        (0, code_1.expect)((0, utility_1.cleanComponentName)('post_it')).equal('post_it');
        // No suffix or prefix: unchanged
        (0, code_1.expect)((0, utility_1.cleanComponentName)('user')).equal('user');
        (0, code_1.expect)((0, utility_1.cleanComponentName)('gas_balance')).equal('gas_balance');
        // Both suffix and prefix: suffix stripped first, then prefix
        (0, code_1.expect)((0, utility_1.cleanComponentName)('get_user_response')).equal('user');
        (0, code_1.expect)((0, utility_1.cleanComponentName)('get_balance_controller')).equal('balance');
    });
    (0, node_test_1.test)('ensureMinEntityName', () => {
        // Names already >= 3 chars are unchanged
        (0, code_1.expect)((0, utility_1.ensureMinEntityName)('foo', {})).equal('foo');
        (0, code_1.expect)((0, utility_1.ensureMinEntityName)('abcd', {})).equal('abcd');
        (0, code_1.expect)((0, utility_1.ensureMinEntityName)('abc', {})).equal('abc');
        // 2-char names get padded with "n"
        (0, code_1.expect)((0, utility_1.ensureMinEntityName)('ab', {})).equal('abn');
        (0, code_1.expect)((0, utility_1.ensureMinEntityName)('dc', {})).equal('dcn');
        // 1-char names get padded with "nt"
        (0, code_1.expect)((0, utility_1.ensureMinEntityName)('d', {})).equal('dnt');
        (0, code_1.expect)((0, utility_1.ensureMinEntityName)('x', {})).equal('xnt');
        // Empty string gets padded
        (0, code_1.expect)((0, utility_1.ensureMinEntityName)('', {})).equal('nt');
        // No collision: padded name is free
        (0, code_1.expect)((0, utility_1.ensureMinEntityName)('ab', { other: {} })).equal('abn');
        // Collision: padded name already taken by a different entity
        (0, code_1.expect)((0, utility_1.ensureMinEntityName)('ab', { abn: {} })).equal('abn2');
        (0, code_1.expect)((0, utility_1.ensureMinEntityName)('ab', { abn: {}, abn2: {} })).equal('abn3');
        // No collision when original name is already in entmap (same entity, re-entry)
        (0, code_1.expect)((0, utility_1.ensureMinEntityName)('foo', { foo: {} })).equal('foo');
        // Short name that doesn't collide after padding
        (0, code_1.expect)((0, utility_1.ensureMinEntityName)('d', { other: {} })).equal('dnt');
        // Short name that collides after padding
        (0, code_1.expect)((0, utility_1.ensureMinEntityName)('d', { dnt: {} })).equal('dnt2');
        (0, code_1.expect)((0, utility_1.ensureMinEntityName)('d', { dnt: {}, dnt2: {} })).equal('dnt3');
        // Names starting with a digit get "n" prefix
        (0, code_1.expect)((0, utility_1.ensureMinEntityName)('510k', {})).equal('n510k');
        (0, code_1.expect)((0, utility_1.ensureMinEntityName)('3d_model', {})).equal('n3d_model');
        (0, code_1.expect)((0, utility_1.ensureMinEntityName)('0day', {})).equal('n0day');
        // Digit prefix also satisfies min-length
        (0, code_1.expect)((0, utility_1.ensureMinEntityName)('9', {})).equal('n9n');
        (0, code_1.expect)((0, utility_1.ensureMinEntityName)('42', {})).equal('n42');
        // Non-digit names are not prefixed
        (0, code_1.expect)((0, utility_1.ensureMinEntityName)('abc', {})).equal('abc');
        // Leading underscores are stripped, then digit prefix applies
        (0, code_1.expect)((0, utility_1.ensureMinEntityName)('_123', {})).equal('n123');
        (0, code_1.expect)((0, utility_1.ensureMinEntityName)('__foo', {})).equal('foo');
        // Digit prefix with collision
        (0, code_1.expect)((0, utility_1.ensureMinEntityName)('510k', { n510k: {} })).equal('n510k2');
        // Non-alphanumeric characters are removed (keeping _)
        (0, code_1.expect)((0, utility_1.ensureMinEntityName)('foo-bar', {})).equal('foobar');
        (0, code_1.expect)((0, utility_1.ensureMinEntityName)('hello.world', {})).equal('helloworld');
        (0, code_1.expect)((0, utility_1.ensureMinEntityName)('a!b@c#d', {})).equal('abcd');
        (0, code_1.expect)((0, utility_1.ensureMinEntityName)('foo_bar', {})).equal('foo_bar');
        (0, code_1.expect)((0, utility_1.ensureMinEntityName)('a[b]', {})).equal('abn');
        // Names under 67 chars are unchanged
        (0, code_1.expect)((0, utility_1.ensureMinEntityName)('this_endpoint_is_tailored_for_searches_based_on_product_name', {})).equal('this_endpoint_is_tailored_for_searches_based_on_product_name');
        // Sentence-length names are truncated to <= 67 chars at word boundaries
        (0, code_1.expect)((0, utility_1.ensureMinEntityName)('if_you_have_the_name_of_a_specific_software_product_and_want_to_check', {})).equal('if_you_have_the_name_of_a_specific_software_product_and_want_to');
        (0, code_1.expect)((0, utility_1.ensureMinEntityName)('this_is_a_very_long_entity_name_that_goes_well_beyond_the_sixty_seven_character_limit_set', {})).equal('this_is_a_very_long_entity_name_that_goes_well_beyond_the_sixty');
        // Names at exactly 67 chars are unchanged
        (0, code_1.expect)((0, utility_1.ensureMinEntityName)('a'.repeat(67), {})).equal('a'.repeat(67));
        // Names at 68 chars get truncated
        (0, code_1.expect)((0, utility_1.ensureMinEntityName)('abcde_' + 'x'.repeat(63), {})).equal('abcde');
        // Single long word with no underscores gets hard-truncated at 67
        (0, code_1.expect)((0, utility_1.ensureMinEntityName)('a'.repeat(80), {})).equal('a'.repeat(67));
        // Truncation with collision
        const truncated = 'if_you_have_the_name_of_a_specific_software_product_and_want_to';
        (0, code_1.expect)((0, utility_1.ensureMinEntityName)('if_you_have_the_name_of_a_specific_software_product_and_want_to_check', { [truncated]: {} })).equal(truncated + '2');
    });
    (0, node_test_1.test)('pathMatch', async () => {
        const pmf = (p, x) => {
            const r = (0, utility_1.pathMatch)(p, x);
            return null === r ? r : { i: r.index, m: r.slice(0), x: r.expr };
        };
        (0, code_1.expect)(pmf('/api/foo0', '/t/t/')).equals({
            i: 0, m: ['api', 'foo0'], x: '/t/t/'
        });
        (0, code_1.expect)(pmf('/api/foo0n', '/t/')).equals(null);
        (0, code_1.expect)(pmf('/api/foo0n', '/t/t/t/')).equals(null);
        (0, code_1.expect)(pmf('/api/foo0n', 'p/')).equals(null);
        (0, code_1.expect)(pmf('/api/foo0n', 't/p/')).equals(null);
        (0, code_1.expect)(pmf('/api/foo0n', '/t/p/')).equals(null);
        (0, code_1.expect)(pmf('/api/foo1/', '/t/t/')).equals({
            m: ['api', 'foo1'], i: 0, x: '/t/t/'
        });
        (0, code_1.expect)(pmf('api/foo2/', '/t/t/')).equals({
            m: ['api', 'foo2'], i: 0, x: '/t/t/'
        });
        (0, code_1.expect)(pmf('api/foo3', '/t/t/')).equals({
            m: ['api', 'foo3'], i: 0, x: '/t/t/'
        });
        (0, code_1.expect)(pmf('/foo4', '/t/')).equals({
            m: ['foo4'], i: 0, x: '/t/'
        });
        (0, code_1.expect)(pmf('/foo5/', '/t/')).equals({
            m: ['foo5'], i: 0, x: '/t/'
        });
        (0, code_1.expect)(pmf('foo6/', '/t/')).equals({
            m: ['foo6'], i: 0, x: '/t/'
        });
        (0, code_1.expect)(pmf('foo7', '/t/')).equals({
            m: ['foo7'], i: 0, x: '/t/'
        });
        (0, code_1.expect)(pmf('a0/{p0}', '/t/p/')).equals({
            m: ['a0', '{p0}'], i: 0, x: '/t/p/'
        });
        (0, code_1.expect)(pmf('{p1}/a1/', '/p/t/')).equals({
            m: ['{p1}', 'a1'], i: 0, x: '/p/t/'
        });
        (0, code_1.expect)(pmf('/a/b/c', '/t')).equals({
            m: ['a'], i: 0, x: '/t'
        });
        (0, code_1.expect)(pmf('/a/b/c', 't')).equals({
            m: ['a'], i: 0, x: 't'
        });
        (0, code_1.expect)(pmf('/a/b/c', 't/')).equals({
            m: ['c'], i: 2, x: 't/'
        });
        (0, code_1.expect)(pmf('/a/b/c', 't/t/')).equals({
            m: ['b', 'c'], i: 1, x: 't/t/'
        });
        (0, code_1.expect)(pmf('/a/b/{c}', 't/p/')).equals({
            m: ['b', '{c}'], i: 1, x: 't/p/'
        });
        (0, code_1.expect)(pmf('/a/b/{c}', 'p/')).equals({
            m: ['{c}'], i: 2, x: 'p/'
        });
        (0, code_1.expect)(pmf('/a/b/{c}', 't/')).equals(null);
        (0, code_1.expect)(pmf('/a/b/{c}/d', 't/p')).equals({
            m: ['b', '{c}'], i: 1, x: 't/p'
        });
        (0, code_1.expect)(pmf('/a/b/{c}/d', 'p/t')).equals({
            m: ['{c}', 'd'], i: 2, x: 'p/t'
        });
        (0, code_1.expect)(pmf('/a/b/{c}/d', 'p/t/')).equals({
            m: ['{c}', 'd'], i: 2, x: 'p/t/'
        });
        (0, code_1.expect)(pmf('/a/b/{c}/d/e', 'p/t/')).equals(null);
        (0, code_1.expect)(pmf('/a/b/{c}/d/e', 'p/t')).equals({
            i: 2, m: ['{c}', 'd'], x: 'p/t'
        });
        (0, code_1.expect)(pmf('/a/b/{c}/d/{e}', 't/p/')).equals({
            i: 3, m: ['d', '{e}'], x: 't/p/'
        });
        (0, code_1.expect)(pmf('/a/b/{c}/d/{e}', 't/p')).equals({
            i: 1, m: ['b', '{c}'], x: 't/p'
        });
        (0, code_1.expect)(pmf('/a/b/{c}/d/{e}', '/t/p')).equals(null);
        (0, code_1.expect)(pmf('/a/b/{c}/d/{e}', 't/p/t/p')).equals({
            i: 1, m: ['b', '{c}', 'd', '{e}'], x: 't/p/t/p'
        });
    });
    (0, node_test_1.test)('formatJSONIC', async () => {
        (0, code_1.expect)((0, utility_1.formatJSONIC)()).equal('');
        (0, code_1.expect)((0, utility_1.formatJSONIC)(undefined)).equal('');
        (0, code_1.expect)((0, utility_1.formatJSONIC)(null)).equal('null\n');
        (0, code_1.expect)((0, utility_1.formatJSONIC)(true)).equal('true\n');
        (0, code_1.expect)((0, utility_1.formatJSONIC)(11)).equal('11\n');
        (0, code_1.expect)((0, utility_1.formatJSONIC)("s")).equal('"s"\n');
        (0, code_1.expect)((0, utility_1.formatJSONIC)({
            "a": 1,
            "a_COMMENT": "note about a",
            "0b_COMMENT": "0b notes",
            "0b": {
                "$": "not printed",
                "_CUR": "dollar",
                "_CUR_COMMENT": [
                    "x",
                    "y"
                ]
            }
        })).equal(`{
  a: 1  # note about a
  "0b": {  # 0b notes
    _CUR: "dollar"  # x; y
  }

}
`);
        const a0 = [100, 101, 102];
        a0['0_COMMENT'] = 'zero';
        a0['2_COMMENT'] = 'two';
        (0, code_1.expect)((0, utility_1.formatJSONIC)({ a: a0, a_COMMENT: 'array' })).equal(`{
  a: [  # array
    100  # zero
    101
    102  # two
  ]

}
`);
        (0, code_1.expect)((0, utility_1.formatJSONIC)({ _COMMENT: 'topO' })).equal(`{  # topO
}
`);
        const a1 = [];
        a1._COMMENT = 'topA';
        (0, code_1.expect)((0, utility_1.formatJSONIC)(a1)).equal(`[  # topA
]
`);
        (0, code_1.expect)((0, utility_1.formatJSONIC)({ a: { b: {}, c: [], d: {} }, e: {} })).equal(`{
  a: {
    b: {
    }
    c: [
    ]
    d: {
    }
  }

  e: {
  }

}
`);
        (0, code_1.expect)((0, utility_1.formatJSONIC)({ a1: { b1: {}, c1: [], d1: {} }, e1: {} }, { hsepd: 2 })).equal(`{
  a1: {
    b1: {
    }

    c1: [
    ]

    d1: {
    }

  }

  e1: {
  }

}
`);
    });
    (0, node_test_1.test)('getModelPath - basic path traversal', () => {
        const model = {
            a: {
                b: {
                    c: 'value'
                }
            }
        };
        (0, code_1.expect)((0, utility_1.getModelPath)(model, 'a')).equal(model.a);
        (0, code_1.expect)((0, utility_1.getModelPath)(model, 'a.b')).equal(model.a.b);
        (0, code_1.expect)((0, utility_1.getModelPath)(model, 'a.b.c')).equal('value');
    });
    (0, node_test_1.test)('getModelPath - array indexing', () => {
        const model = {
            items: [
                { name: 'first', value: 1 },
                { name: 'second', value: 2 },
                { name: 'third', value: 3 }
            ]
        };
        (0, code_1.expect)((0, utility_1.getModelPath)(model, 'items.0')).equal(model.items[0]);
        (0, code_1.expect)((0, utility_1.getModelPath)(model, 'items.1')).equal(model.items[1]);
        (0, code_1.expect)((0, utility_1.getModelPath)(model, 'items.2')).equal(model.items[2]);
        (0, code_1.expect)((0, utility_1.getModelPath)(model, 'items.0.name')).equal('first');
        (0, code_1.expect)((0, utility_1.getModelPath)(model, 'items.1.value')).equal(2);
        (0, code_1.expect)((0, utility_1.getModelPath)(model, 'items.2.name')).equal('third');
    });
    (0, node_test_1.test)('getModelPath - nested arrays and objects', () => {
        const model = {
            data: {
                nested: [
                    {
                        items: [
                            { id: 'a' },
                            { id: 'b' }
                        ]
                    }
                ]
            }
        };
        (0, code_1.expect)((0, utility_1.getModelPath)(model, 'data.nested.0.items.0.id')).equal('a');
        (0, code_1.expect)((0, utility_1.getModelPath)(model, 'data.nested.0.items.1.id')).equal('b');
    });
    (0, node_test_1.test)('getModelPath - required:true (default) throws on missing path', () => {
        const model = {
            a: {
                b: 'value'
            }
        };
        // Missing intermediate key
        try {
            (0, utility_1.getModelPath)(model, 'a.x.c');
            (0, code_1.expect)(false).true(); // Should not reach here
        }
        catch (err) {
            (0, code_1.expect)(err.message).contains("path not found at 'a.x.c'");
            (0, code_1.expect)(err.message).contains("Valid path up to: 'a'");
            (0, code_1.expect)(err.message).contains("Property 'x' does not exist");
            (0, code_1.expect)(err.message).contains("Available keys: [b]");
        }
        // Missing final key - should show available keys
        try {
            (0, utility_1.getModelPath)(model, 'a.missing');
            (0, code_1.expect)(false).true(); // Should not reach here
        }
        catch (err) {
            (0, code_1.expect)(err.message).contains("path not found at 'a.missing'");
            (0, code_1.expect)(err.message).contains("Valid path up to: 'a'");
            (0, code_1.expect)(err.message).contains("Property 'missing' does not exist");
            (0, code_1.expect)(err.message).contains("Available keys: [b]");
        }
        // Missing root key
        try {
            (0, utility_1.getModelPath)(model, 'missing');
            (0, code_1.expect)(false).true(); // Should not reach here
        }
        catch (err) {
            (0, code_1.expect)(err.message).contains("path not found at 'missing'");
            (0, code_1.expect)(err.message).contains("Valid path up to: '(root)'");
            (0, code_1.expect)(err.message).contains("Property 'missing' does not exist");
            (0, code_1.expect)(err.message).contains("Available keys: [a]");
        }
    });
    (0, node_test_1.test)('getModelPath - required:true throws on null/undefined in path', () => {
        const model = {
            a: {
                b: null
            }
        };
        try {
            (0, utility_1.getModelPath)(model, 'a.b.c');
            (0, code_1.expect)(false).true(); // Should not reach here
        }
        catch (err) {
            (0, code_1.expect)(err.message).contains("path not found at 'a.b.c'");
            (0, code_1.expect)(err.message).contains("Valid path up to: 'a.b'");
            (0, code_1.expect)(err.message).contains("Cannot access property 'c' of null");
        }
        const model2 = {
            a: {
                b: undefined
            }
        };
        try {
            (0, utility_1.getModelPath)(model2, 'a.b.c');
            (0, code_1.expect)(false).true(); // Should not reach here
        }
        catch (err) {
            (0, code_1.expect)(err.message).contains("path not found at 'a.b.c'");
            (0, code_1.expect)(err.message).contains("Valid path up to: 'a.b'");
            (0, code_1.expect)(err.message).contains("Cannot access property 'c' of undefined");
        }
    });
    (0, node_test_1.test)('getModelPath - required:true throws on array index out of bounds', () => {
        const model = {
            items: [
                { name: 'first' },
                { name: 'second' }
            ]
        };
        try {
            (0, utility_1.getModelPath)(model, 'items.5');
            (0, code_1.expect)(false).true(); // Should not reach here
        }
        catch (err) {
            (0, code_1.expect)(err.message).contains("path not found at 'items.5'");
            (0, code_1.expect)(err.message).contains("Valid path up to: 'items'");
            (0, code_1.expect)(err.message).contains("Property '5' does not exist");
            (0, code_1.expect)(err.message).contains("Available keys: array indices 0-1");
        }
    });
    (0, node_test_1.test)('getModelPath - required:false returns undefined on missing path', () => {
        const model = {
            a: {
                b: 'value'
            }
        };
        (0, code_1.expect)((0, utility_1.getModelPath)(model, 'a.x.c', { required: false })).equal(undefined);
        (0, code_1.expect)((0, utility_1.getModelPath)(model, 'a.missing', { required: false })).equal(undefined);
        (0, code_1.expect)((0, utility_1.getModelPath)(model, 'missing', { required: false })).equal(undefined);
        (0, code_1.expect)((0, utility_1.getModelPath)(model, 'a.b.c', { required: false })).equal(undefined);
    });
    (0, node_test_1.test)('getModelPath - required:false returns undefined on null/undefined in path', () => {
        const model = {
            a: {
                b: null
            }
        };
        (0, code_1.expect)((0, utility_1.getModelPath)(model, 'a.b.c', { required: false })).equal(undefined);
        const model2 = {
            a: {
                b: undefined
            }
        };
        (0, code_1.expect)((0, utility_1.getModelPath)(model2, 'a.b.c', { required: false })).equal(undefined);
    });
    (0, node_test_1.test)('getModelPath - required:false returns undefined for array out of bounds', () => {
        const model = {
            items: [{ name: 'first' }]
        };
        (0, code_1.expect)((0, utility_1.getModelPath)(model, 'items.5', { required: false })).equal(undefined);
        (0, code_1.expect)((0, utility_1.getModelPath)(model, 'items.5.name', { required: false })).equal(undefined);
    });
    (0, node_test_1.test)('getModelPath - empty path handling', () => {
        const model = { a: 'value' };
        try {
            (0, utility_1.getModelPath)(model, '');
            (0, code_1.expect)(false).true(); // Should not reach here
        }
        catch (err) {
            (0, code_1.expect)(err.message).contains('empty path provided');
        }
        (0, code_1.expect)((0, utility_1.getModelPath)(model, '', { required: false })).equal(undefined);
    });
    (0, node_test_1.test)('getModelPath - returns actual values including falsy ones', () => {
        const model = {
            zero: 0,
            empty: '',
            falsy: false,
            nullValue: null
        };
        (0, code_1.expect)((0, utility_1.getModelPath)(model, 'zero')).equal(0);
        (0, code_1.expect)((0, utility_1.getModelPath)(model, 'empty')).equal('');
        (0, code_1.expect)((0, utility_1.getModelPath)(model, 'falsy')).equal(false);
        (0, code_1.expect)((0, utility_1.getModelPath)(model, 'nullValue')).equal(null);
    });
});
//# sourceMappingURL=utility.test.js.map