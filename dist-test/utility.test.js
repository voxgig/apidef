"use strict";
/* Copyright (c) 2024-2025 Voxgig Ltd, MIT License */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const node_assert_1 = __importDefault(require("node:assert"));
const jostraca_1 = require("jostraca");
const utility_1 = require("../dist/utility");
(0, node_test_1.describe)('utility', () => {
    (0, node_test_1.test)('depluralize', () => {
        node_assert_1.default.deepStrictEqual((0, utility_1.depluralize)('Dogs'), 'Dog');
        node_assert_1.default.deepStrictEqual((0, utility_1.depluralize)('countries'), 'country');
        node_assert_1.default.deepStrictEqual((0, utility_1.depluralize)('good_dogs'), 'good_dog');
        node_assert_1.default.deepStrictEqual((0, utility_1.depluralize)('many_countries'), 'many_country');
        node_assert_1.default.deepStrictEqual((0, utility_1.depluralize)('mice'), 'mouse');
        node_assert_1.default.deepStrictEqual((0, utility_1.depluralize)('many_mice'), 'many_mouse');
        node_assert_1.default.deepStrictEqual((0, utility_1.depluralize)('api_key'), 'api_key');
        node_assert_1.default.deepStrictEqual((0, utility_1.depluralize)('api_keys'), 'api_key');
        node_assert_1.default.deepStrictEqual((0, utility_1.depluralize)('ApiKeys'), 'ApiKey');
        node_assert_1.default.deepStrictEqual((0, utility_1.depluralize)('API_Keys'), 'API_Key');
        // Words where -ies is part of the base form, not a plural suffix
        node_assert_1.default.deepStrictEqual((0, utility_1.depluralize)('species'), 'species');
        node_assert_1.default.deepStrictEqual((0, utility_1.depluralize)('series'), 'series');
        node_assert_1.default.deepStrictEqual((0, utility_1.depluralize)('movies'), 'movie');
        node_assert_1.default.deepStrictEqual((0, utility_1.depluralize)('amiiboseries'), 'amiiboseries');
        // Words that should not be truncated to <= 2 chars
        node_assert_1.default.deepStrictEqual((0, utility_1.depluralize)('yes'), 'yes');
        node_assert_1.default.deepStrictEqual((0, utility_1.depluralize)('lens'), 'lens');
        node_assert_1.default.deepStrictEqual((0, utility_1.depluralize)('phrase'), 'phrase');
        node_assert_1.default.deepStrictEqual((0, utility_1.depluralize)('abs'), 'abs');
    });
    (0, node_test_1.test)('canonize', () => {
        // Basic canonization
        node_assert_1.default.deepStrictEqual((0, utility_1.canonize)('Dogs'), 'dog');
        node_assert_1.default.deepStrictEqual((0, utility_1.canonize)('FooBar'), 'foo_bar');
        node_assert_1.default.deepStrictEqual((0, utility_1.canonize)('my-thing'), 'my_thing');
        // File extensions are stripped
        node_assert_1.default.deepStrictEqual((0, utility_1.canonize)('categories.php'), 'category');
        node_assert_1.default.deepStrictEqual((0, utility_1.canonize)('search.php'), 'search');
        node_assert_1.default.deepStrictEqual((0, utility_1.canonize)('data.json'), 'data');
        node_assert_1.default.deepStrictEqual((0, utility_1.canonize)('region.json'), 'region');
        node_assert_1.default.deepStrictEqual((0, utility_1.canonize)('list.txt'), 'list');
        node_assert_1.default.deepStrictEqual((0, utility_1.canonize)('height.jpg'), 'height');
        node_assert_1.default.deepStrictEqual((0, utility_1.canonize)('location.png'), 'location');
        node_assert_1.default.deepStrictEqual((0, utility_1.canonize)('robots.txt'), 'robot');
        node_assert_1.default.deepStrictEqual((0, utility_1.canonize)('config.yaml'), 'config');
        node_assert_1.default.deepStrictEqual((0, utility_1.canonize)('schema.xml'), 'schema');
        // Extensions are case-insensitive
        node_assert_1.default.deepStrictEqual((0, utility_1.canonize)('data.JSON'), 'data');
        node_assert_1.default.deepStrictEqual((0, utility_1.canonize)('page.PHP'), 'page');
        // Non-extension dots are not matched (no known extension)
        node_assert_1.default.deepStrictEqual((0, utility_1.canonize)('v2.0'), 'v20');
        // Extension only stripped at end
        node_assert_1.default.deepStrictEqual((0, utility_1.canonize)('json_data'), 'json_data');
        node_assert_1.default.deepStrictEqual((0, utility_1.canonize)('php_version'), 'php_version');
        // Accented characters are transliterated
        node_assert_1.default.deepStrictEqual((0, utility_1.canonize)('dólar'), 'dolar');
        node_assert_1.default.deepStrictEqual((0, utility_1.canonize)('kölner'), 'kolner');
        node_assert_1.default.deepStrictEqual((0, utility_1.canonize)('pokémon'), 'pokemon');
        node_assert_1.default.deepStrictEqual((0, utility_1.canonize)('café'), 'cafe');
        node_assert_1.default.deepStrictEqual((0, utility_1.canonize)('naïve'), 'naive');
        node_assert_1.default.deepStrictEqual((0, utility_1.canonize)('über'), 'uber');
        node_assert_1.default.deepStrictEqual((0, utility_1.canonize)('résumé'), 'resume');
        node_assert_1.default.deepStrictEqual((0, utility_1.canonize)('señor'), 'senor');
        // Non-Latin chars are stripped (no transliteration)
        node_assert_1.default.deepStrictEqual((0, utility_1.canonize)('api検索'), 'api');
        node_assert_1.default.deepStrictEqual((0, utility_1.canonize)('会議録'), '');
    });
    (0, node_test_1.test)('sanitizeSlug', () => {
        // Simple slugs pass through unchanged
        node_assert_1.default.deepStrictEqual((0, utility_1.sanitizeSlug)('my-api'), 'my-api');
        node_assert_1.default.deepStrictEqual((0, utility_1.sanitizeSlug)('cool-service'), 'cool-service');
        // Accented characters are transliterated
        node_assert_1.default.deepStrictEqual((0, utility_1.sanitizeSlug)('dólar-api'), 'dolar-api');
        node_assert_1.default.deepStrictEqual((0, utility_1.sanitizeSlug)('café-service'), 'cafe-service');
        // Underscores and dots become hyphens
        node_assert_1.default.deepStrictEqual((0, utility_1.sanitizeSlug)('my_api'), 'my-api');
        node_assert_1.default.deepStrictEqual((0, utility_1.sanitizeSlug)('api.v2'), 'api-v2');
        node_assert_1.default.deepStrictEqual((0, utility_1.sanitizeSlug)('my_cool.api'), 'my-cool-api');
        // Special chars are stripped
        node_assert_1.default.deepStrictEqual((0, utility_1.sanitizeSlug)("bob's-api"), 'bobs-api');
        node_assert_1.default.deepStrictEqual((0, utility_1.sanitizeSlug)('api!(v2)'), 'apiv2');
        // Standalone number segments merge with preceding word
        node_assert_1.default.deepStrictEqual((0, utility_1.sanitizeSlug)('ec-2-shop'), 'ec2-shop');
        node_assert_1.default.deepStrictEqual((0, utility_1.sanitizeSlug)('advice-slip-api-2'), 'advice-slip-api2');
        node_assert_1.default.deepStrictEqual((0, utility_1.sanitizeSlug)('s-3-bucket'), 's3-bucket');
        // Leading numbers get 'n' prefix (must be valid JS identifier)
        node_assert_1.default.deepStrictEqual((0, utility_1.sanitizeSlug)('2-fast'), 'n2-fast');
        node_assert_1.default.deepStrictEqual((0, utility_1.sanitizeSlug)('404-error-handler'), 'n404-error-handler');
        node_assert_1.default.deepStrictEqual((0, utility_1.sanitizeSlug)('4chan-api'), 'n4chan-api');
        node_assert_1.default.deepStrictEqual((0, utility_1.sanitizeSlug)('7timer-weather-api'), 'n7timer-weather-api');
        // Hyphens are collapsed and trimmed
        node_assert_1.default.deepStrictEqual((0, utility_1.sanitizeSlug)('--my--api--'), 'my-api');
        // Empty/null returns 'unknown'
        node_assert_1.default.deepStrictEqual((0, utility_1.sanitizeSlug)(''), 'unknown');
        node_assert_1.default.deepStrictEqual((0, utility_1.sanitizeSlug)('!!!'), 'unknown');
        // Non-Latin chars are stripped
        node_assert_1.default.deepStrictEqual((0, utility_1.sanitizeSlug)('api検索'), 'api');
    });
    (0, node_test_1.test)('slugToPascalCase', () => {
        // Simple slugs
        node_assert_1.default.deepStrictEqual((0, utility_1.slugToPascalCase)('my-api'), 'MyApi');
        node_assert_1.default.deepStrictEqual((0, utility_1.slugToPascalCase)('cool-service'), 'CoolService');
        // Accented characters are transliterated
        node_assert_1.default.deepStrictEqual((0, utility_1.slugToPascalCase)('dólar-y-monedas-api'), 'DolarYMonedasApi');
        // Special characters are stripped
        node_assert_1.default.deepStrictEqual((0, utility_1.slugToPascalCase)('data.gov.au-api'), 'DataGovAuApi');
        node_assert_1.default.deepStrictEqual((0, utility_1.slugToPascalCase)('osu!-beatmap-api'), 'OsuBeatmapApi');
        node_assert_1.default.deepStrictEqual((0, utility_1.slugToPascalCase)('healthcare.gov-content-api'), 'HealthcareGovContentApi');
        node_assert_1.default.deepStrictEqual((0, utility_1.slugToPascalCase)('phish.in-api'), 'PhishInApi');
        node_assert_1.default.deepStrictEqual((0, utility_1.slugToPascalCase)('v.gd-api'), 'VGdApi');
        node_assert_1.default.deepStrictEqual((0, utility_1.slugToPascalCase)('swiss-federal-railways-(sbb)'), 'SwissFederalRailwaysSbb');
        node_assert_1.default.deepStrictEqual((0, utility_1.slugToPascalCase)('yu-gi-oh!-api'), 'YuGiOhApi');
        // Leading numbers get 'n' prefix
        node_assert_1.default.deepStrictEqual((0, utility_1.slugToPascalCase)('404-error-handler'), 'N404ErrorHandler');
        node_assert_1.default.deepStrictEqual((0, utility_1.slugToPascalCase)('4chan-api'), 'N4chanApi');
        node_assert_1.default.deepStrictEqual((0, utility_1.slugToPascalCase)('7timer-weather-api'), 'N7timerWeatherApi');
        // Embedded numbers merge with preceding word
        node_assert_1.default.deepStrictEqual((0, utility_1.slugToPascalCase)('ec-2-shop'), 'Ec2Shop');
        node_assert_1.default.deepStrictEqual((0, utility_1.slugToPascalCase)('guild-wars-2-api'), 'GuildWars2Api');
        node_assert_1.default.deepStrictEqual((0, utility_1.slugToPascalCase)('magic-8-ball-api'), 'Magic8BallApi');
        // Normal slugs
        node_assert_1.default.deepStrictEqual((0, utility_1.slugToPascalCase)('no-as-a-service'), 'NoAsAService');
        node_assert_1.default.deepStrictEqual((0, utility_1.slugToPascalCase)('yes-as-a-service'), 'YesAsAService');
        node_assert_1.default.deepStrictEqual((0, utility_1.slugToPascalCase)('shame-as-a-service'), 'ShameAsAService');
        node_assert_1.default.deepStrictEqual((0, utility_1.slugToPascalCase)('api'), 'Api');
        // Edge cases
        node_assert_1.default.deepStrictEqual((0, utility_1.slugToPascalCase)(''), 'Unknown');
        node_assert_1.default.deepStrictEqual((0, utility_1.slugToPascalCase)('!!!'), 'Unknown');
    });
    (0, node_test_1.test)('transliterate', () => {
        // Latin diacritics are decomposed
        node_assert_1.default.deepStrictEqual((0, utility_1.transliterate)('dólar'), 'dolar');
        node_assert_1.default.deepStrictEqual((0, utility_1.transliterate)('kölner'), 'kolner');
        node_assert_1.default.deepStrictEqual((0, utility_1.transliterate)('pokémon'), 'pokemon');
        node_assert_1.default.deepStrictEqual((0, utility_1.transliterate)('résumé'), 'resume');
        node_assert_1.default.deepStrictEqual((0, utility_1.transliterate)('naïve'), 'naive');
        node_assert_1.default.deepStrictEqual((0, utility_1.transliterate)('über'), 'uber');
        node_assert_1.default.deepStrictEqual((0, utility_1.transliterate)('señor'), 'senor');
        node_assert_1.default.deepStrictEqual((0, utility_1.transliterate)('café'), 'cafe');
        node_assert_1.default.deepStrictEqual((0, utility_1.transliterate)('Ångström'), 'Angstrom');
        // ASCII unchanged
        node_assert_1.default.deepStrictEqual((0, utility_1.transliterate)('hello'), 'hello');
        node_assert_1.default.deepStrictEqual((0, utility_1.transliterate)('foo-bar_123'), 'foo-bar_123');
        // Non-Latin scripts pass through (stripped later by canonize)
        node_assert_1.default.deepStrictEqual((0, utility_1.transliterate)('会議録'), '会議録');
        node_assert_1.default.deepStrictEqual((0, utility_1.transliterate)('api検索'), 'api検索');
    });
    (0, node_test_1.test)('normalizeFieldName', () => {
        // Bracket notation becomes underscores
        node_assert_1.default.deepStrictEqual((0, utility_1.normalizeFieldName)('filter[text]'), 'filter_text');
        node_assert_1.default.deepStrictEqual((0, utility_1.normalizeFieldName)('page[limit]'), 'page_limit');
        node_assert_1.default.deepStrictEqual((0, utility_1.normalizeFieldName)('page[offset]'), 'page_offset');
        // Nested brackets
        node_assert_1.default.deepStrictEqual((0, utility_1.normalizeFieldName)('conditions[publication_date][gte]'), 'conditions_publication_date_gte');
        // Trailing empty brackets are stripped
        node_assert_1.default.deepStrictEqual((0, utility_1.normalizeFieldName)('fields[]'), 'fields');
        node_assert_1.default.deepStrictEqual((0, utility_1.normalizeFieldName)('conditions[agencies][]'), 'conditions_agencies');
        node_assert_1.default.deepStrictEqual((0, utility_1.normalizeFieldName)('conditions[type][]'), 'conditions_type');
        // Dot notation becomes underscores
        node_assert_1.default.deepStrictEqual((0, utility_1.normalizeFieldName)('facet.field'), 'facet_field');
        node_assert_1.default.deepStrictEqual((0, utility_1.normalizeFieldName)('refine.country'), 'refine_country');
        // Regular names unchanged
        node_assert_1.default.deepStrictEqual((0, utility_1.normalizeFieldName)('name'), 'name');
        node_assert_1.default.deepStrictEqual((0, utility_1.normalizeFieldName)('created_at'), 'created_at');
        // Empty/null
        node_assert_1.default.deepStrictEqual((0, utility_1.normalizeFieldName)(''), '');
        // No duplicate or leading/trailing underscores
        node_assert_1.default.deepStrictEqual((0, utility_1.normalizeFieldName)('[foo]'), 'foo');
        node_assert_1.default.deepStrictEqual((0, utility_1.normalizeFieldName)('a..b'), 'a_b');
    });
    (0, node_test_1.test)('normalizeFieldName with canonize (field pipeline)', () => {
        // Bracket notation: full field name pipeline as used in resolveOpFields
        node_assert_1.default.deepStrictEqual((0, utility_1.canonize)((0, utility_1.normalizeFieldName)('filter[text]')), 'filter_text');
        node_assert_1.default.deepStrictEqual((0, utility_1.canonize)((0, utility_1.normalizeFieldName)('page[limit]')), 'page_limit');
        node_assert_1.default.deepStrictEqual((0, utility_1.canonize)((0, utility_1.normalizeFieldName)('page[offset]')), 'page_offset');
        // Nested brackets
        node_assert_1.default.deepStrictEqual((0, utility_1.canonize)((0, utility_1.normalizeFieldName)('conditions[agencies][]')), 'conditions_agency');
        node_assert_1.default.deepStrictEqual((0, utility_1.canonize)((0, utility_1.normalizeFieldName)('conditions[publication_date][gte]')), 'conditions_publication_date_gte');
        node_assert_1.default.deepStrictEqual((0, utility_1.canonize)((0, utility_1.normalizeFieldName)('conditions[type][]')), 'conditions_type');
        node_assert_1.default.deepStrictEqual((0, utility_1.canonize)((0, utility_1.normalizeFieldName)('fields[]')), 'field');
        // Dot notation
        node_assert_1.default.deepStrictEqual((0, utility_1.canonize)((0, utility_1.normalizeFieldName)('facet.field')), 'facet_field');
        node_assert_1.default.deepStrictEqual((0, utility_1.canonize)((0, utility_1.normalizeFieldName)('refine.country')), 'refine_country');
        node_assert_1.default.deepStrictEqual((0, utility_1.canonize)((0, utility_1.normalizeFieldName)('refine.type')), 'refine_type');
        // Regular names pass through normally
        node_assert_1.default.deepStrictEqual((0, utility_1.canonize)((0, utility_1.normalizeFieldName)('created_at')), 'created_at');
        node_assert_1.default.deepStrictEqual((0, utility_1.canonize)((0, utility_1.normalizeFieldName)('UserName')), 'user_name');
    });
    (0, node_test_1.test)('normalizeFieldName with snakify (arg pipeline)', () => {
        // Bracket notation: arg name pipeline as used in resolveArgs
        const argPipeline = (s) => (0, utility_1.depluralize)((0, jostraca_1.snakify)((0, utility_1.normalizeFieldName)(s)));
        node_assert_1.default.deepStrictEqual(argPipeline('filter[text]'), 'filter_text');
        node_assert_1.default.deepStrictEqual(argPipeline('page[limit]'), 'page_limit');
        node_assert_1.default.deepStrictEqual(argPipeline('filter[route]'), 'filter_route');
        // Nested brackets
        node_assert_1.default.deepStrictEqual(argPipeline('conditions[agencies][]'), 'conditions_agency');
        node_assert_1.default.deepStrictEqual(argPipeline('conditions[publication_date][gte]'), 'conditions_publication_date_gte');
        // Dot notation
        node_assert_1.default.deepStrictEqual(argPipeline('facet.field'), 'facet_field');
        node_assert_1.default.deepStrictEqual(argPipeline('refine.country'), 'refine_country');
        // CamelCase args
        node_assert_1.default.deepStrictEqual(argPipeline('filterText'), 'filter_text');
        node_assert_1.default.deepStrictEqual(argPipeline('pageLimit'), 'page_limit');
        // Regular args unchanged
        node_assert_1.default.deepStrictEqual(argPipeline('sort'), 'sort');
        node_assert_1.default.deepStrictEqual(argPipeline('include'), 'include');
    });
    (0, node_test_1.test)('inferFieldType', () => {
        // Boolean patterns: $ANY -> $BOOLEAN
        node_assert_1.default.deepStrictEqual((0, utility_1.inferFieldType)('is_blocked', '`$ANY`'), '`$BOOLEAN`');
        node_assert_1.default.deepStrictEqual((0, utility_1.inferFieldType)('has_homepage', '`$ANY`'), '`$BOOLEAN`');
        node_assert_1.default.deepStrictEqual((0, utility_1.inferFieldType)('can_edit', '`$ANY`'), '`$BOOLEAN`');
        node_assert_1.default.deepStrictEqual((0, utility_1.inferFieldType)('should_notify', '`$ANY`'), '`$BOOLEAN`');
        node_assert_1.default.deepStrictEqual((0, utility_1.inferFieldType)('allow_merge', '`$ANY`'), '`$BOOLEAN`');
        node_assert_1.default.deepStrictEqual((0, utility_1.inferFieldType)('enabled', '`$ANY`'), '`$BOOLEAN`');
        node_assert_1.default.deepStrictEqual((0, utility_1.inferFieldType)('disabled', '`$ANY`'), '`$BOOLEAN`');
        node_assert_1.default.deepStrictEqual((0, utility_1.inferFieldType)('active', '`$ANY`'), '`$BOOLEAN`');
        node_assert_1.default.deepStrictEqual((0, utility_1.inferFieldType)('visible', '`$ANY`'), '`$BOOLEAN`');
        node_assert_1.default.deepStrictEqual((0, utility_1.inferFieldType)('deleted', '`$ANY`'), '`$BOOLEAN`');
        node_assert_1.default.deepStrictEqual((0, utility_1.inferFieldType)('verified', '`$ANY`'), '`$BOOLEAN`');
        node_assert_1.default.deepStrictEqual((0, utility_1.inferFieldType)('locked', '`$ANY`'), '`$BOOLEAN`');
        node_assert_1.default.deepStrictEqual((0, utility_1.inferFieldType)('archived', '`$ANY`'), '`$BOOLEAN`');
        node_assert_1.default.deepStrictEqual((0, utility_1.inferFieldType)('blocked', '`$ANY`'), '`$BOOLEAN`');
        // Boolean patterns: $STRING -> $BOOLEAN
        node_assert_1.default.deepStrictEqual((0, utility_1.inferFieldType)('is_blocked', '`$STRING`'), '`$BOOLEAN`');
        node_assert_1.default.deepStrictEqual((0, utility_1.inferFieldType)('has_homepage', '`$STRING`'), '`$BOOLEAN`');
        node_assert_1.default.deepStrictEqual((0, utility_1.inferFieldType)('is_smartlink', '`$STRING`'), '`$BOOLEAN`');
        node_assert_1.default.deepStrictEqual((0, utility_1.inferFieldType)('active', '`$STRING`'), '`$BOOLEAN`');
        // $STRING not overridden for non-boolean patterns
        node_assert_1.default.deepStrictEqual((0, utility_1.inferFieldType)('name', '`$STRING`'), '`$STRING`');
        node_assert_1.default.deepStrictEqual((0, utility_1.inferFieldType)('total_count', '`$STRING`'), '`$STRING`');
        // ID patterns: $ANY -> $STRING
        node_assert_1.default.deepStrictEqual((0, utility_1.inferFieldType)('id', '`$ANY`'), '`$STRING`');
        node_assert_1.default.deepStrictEqual((0, utility_1.inferFieldType)('user_id', '`$ANY`'), '`$STRING`');
        node_assert_1.default.deepStrictEqual((0, utility_1.inferFieldType)('project_id', '`$ANY`'), '`$STRING`');
        // Integer patterns: $ANY -> $INTEGER
        node_assert_1.default.deepStrictEqual((0, utility_1.inferFieldType)('total_count', '`$ANY`'), '`$INTEGER`');
        node_assert_1.default.deepStrictEqual((0, utility_1.inferFieldType)('item_count', '`$ANY`'), '`$INTEGER`');
        node_assert_1.default.deepStrictEqual((0, utility_1.inferFieldType)('page_number', '`$ANY`'), '`$INTEGER`');
        node_assert_1.default.deepStrictEqual((0, utility_1.inferFieldType)('limit', '`$ANY`'), '`$INTEGER`');
        node_assert_1.default.deepStrictEqual((0, utility_1.inferFieldType)('page', '`$ANY`'), '`$INTEGER`');
        node_assert_1.default.deepStrictEqual((0, utility_1.inferFieldType)('offset', '`$ANY`'), '`$INTEGER`');
        node_assert_1.default.deepStrictEqual((0, utility_1.inferFieldType)('per_page', '`$ANY`'), '`$INTEGER`');
        node_assert_1.default.deepStrictEqual((0, utility_1.inferFieldType)('page_size', '`$ANY`'), '`$INTEGER`');
        node_assert_1.default.deepStrictEqual((0, utility_1.inferFieldType)('size', '`$ANY`'), '`$INTEGER`');
        node_assert_1.default.deepStrictEqual((0, utility_1.inferFieldType)('skip', '`$ANY`'), '`$INTEGER`');
        node_assert_1.default.deepStrictEqual((0, utility_1.inferFieldType)('num_item', '`$ANY`'), '`$INTEGER`');
        // Number patterns: $ANY -> $NUMBER
        node_assert_1.default.deepStrictEqual((0, utility_1.inferFieldType)('latitude', '`$ANY`'), '`$NUMBER`');
        node_assert_1.default.deepStrictEqual((0, utility_1.inferFieldType)('longitude', '`$ANY`'), '`$NUMBER`');
        node_assert_1.default.deepStrictEqual((0, utility_1.inferFieldType)('lat', '`$ANY`'), '`$NUMBER`');
        node_assert_1.default.deepStrictEqual((0, utility_1.inferFieldType)('lng', '`$ANY`'), '`$NUMBER`');
        node_assert_1.default.deepStrictEqual((0, utility_1.inferFieldType)('price', '`$ANY`'), '`$NUMBER`');
        node_assert_1.default.deepStrictEqual((0, utility_1.inferFieldType)('amount', '`$ANY`'), '`$NUMBER`');
        node_assert_1.default.deepStrictEqual((0, utility_1.inferFieldType)('score', '`$ANY`'), '`$NUMBER`');
        node_assert_1.default.deepStrictEqual((0, utility_1.inferFieldType)('weight', '`$ANY`'), '`$NUMBER`');
        node_assert_1.default.deepStrictEqual((0, utility_1.inferFieldType)('radius', '`$ANY`'), '`$NUMBER`');
        node_assert_1.default.deepStrictEqual((0, utility_1.inferFieldType)('distance', '`$ANY`'), '`$NUMBER`');
        node_assert_1.default.deepStrictEqual((0, utility_1.inferFieldType)('percentage', '`$ANY`'), '`$NUMBER`');
        // String patterns: $ANY -> $STRING
        node_assert_1.default.deepStrictEqual((0, utility_1.inferFieldType)('url', '`$ANY`'), '`$STRING`');
        node_assert_1.default.deepStrictEqual((0, utility_1.inferFieldType)('href', '`$ANY`'), '`$STRING`');
        node_assert_1.default.deepStrictEqual((0, utility_1.inferFieldType)('email', '`$ANY`'), '`$STRING`');
        node_assert_1.default.deepStrictEqual((0, utility_1.inferFieldType)('name', '`$ANY`'), '`$STRING`');
        node_assert_1.default.deepStrictEqual((0, utility_1.inferFieldType)('title', '`$ANY`'), '`$STRING`');
        node_assert_1.default.deepStrictEqual((0, utility_1.inferFieldType)('description', '`$ANY`'), '`$STRING`');
        node_assert_1.default.deepStrictEqual((0, utility_1.inferFieldType)('slug', '`$ANY`'), '`$STRING`');
        node_assert_1.default.deepStrictEqual((0, utility_1.inferFieldType)('token', '`$ANY`'), '`$STRING`');
        // Specific types from spec are not overridden
        node_assert_1.default.deepStrictEqual((0, utility_1.inferFieldType)('latitude', '`$STRING`'), '`$STRING`');
        node_assert_1.default.deepStrictEqual((0, utility_1.inferFieldType)('limit', '`$INTEGER`'), '`$INTEGER`');
        node_assert_1.default.deepStrictEqual((0, utility_1.inferFieldType)('id', '`$INTEGER`'), '`$INTEGER`');
        node_assert_1.default.deepStrictEqual((0, utility_1.inferFieldType)('price', '`$NUMBER`'), '`$NUMBER`');
        node_assert_1.default.deepStrictEqual((0, utility_1.inferFieldType)('is_active', '`$BOOLEAN`'), '`$BOOLEAN`');
        // Unknown field names with $ANY stay $ANY
        node_assert_1.default.deepStrictEqual((0, utility_1.inferFieldType)('data', '`$ANY`'), '`$ANY`');
        node_assert_1.default.deepStrictEqual((0, utility_1.inferFieldType)('result', '`$ANY`'), '`$ANY`');
        node_assert_1.default.deepStrictEqual((0, utility_1.inferFieldType)('custom_field', '`$ANY`'), '`$ANY`');
        // Names that look similar but should not be overridden
        node_assert_1.default.deepStrictEqual((0, utility_1.inferFieldType)('disable_reason', '`$STRING`'), '`$STRING`');
        node_assert_1.default.deepStrictEqual((0, utility_1.inferFieldType)('disable_reason', '`$ANY`'), '`$ANY`');
        node_assert_1.default.deepStrictEqual((0, utility_1.inferFieldType)('activation_code', '`$ANY`'), '`$ANY`');
        node_assert_1.default.deepStrictEqual((0, utility_1.inferFieldType)('page_title', '`$ANY`'), '`$ANY`');
    });
    (0, node_test_1.test)('cleanComponentName', () => {
        // Controller suffixes are stripped
        node_assert_1.default.deepStrictEqual((0, utility_1.cleanComponentName)('nps_controller'), 'nps');
        node_assert_1.default.deepStrictEqual((0, utility_1.cleanComponentName)('balance_controller'), 'balance');
        node_assert_1.default.deepStrictEqual((0, utility_1.cleanComponentName)('gas_system_controller'), 'gas_system');
        // Rest controller suffix (two parts) is stripped
        node_assert_1.default.deepStrictEqual((0, utility_1.cleanComponentName)('donate_rest_controller'), 'donate');
        node_assert_1.default.deepStrictEqual((0, utility_1.cleanComponentName)('portfolio_rest_controller'), 'portfolio');
        // Response/request suffixes are stripped
        node_assert_1.default.deepStrictEqual((0, utility_1.cleanComponentName)('user_response'), 'user');
        node_assert_1.default.deepStrictEqual((0, utility_1.cleanComponentName)('order_request'), 'order');
        // HTTP verb prefixes are stripped
        node_assert_1.default.deepStrictEqual((0, utility_1.cleanComponentName)('get_account_lookup'), 'account_lookup');
        node_assert_1.default.deepStrictEqual((0, utility_1.cleanComponentName)('post_transfer'), 'transfer');
        node_assert_1.default.deepStrictEqual((0, utility_1.cleanComponentName)('put_setting'), 'setting');
        node_assert_1.default.deepStrictEqual((0, utility_1.cleanComponentName)('delete_item'), 'item');
        node_assert_1.default.deepStrictEqual((0, utility_1.cleanComponentName)('patch_record'), 'record');
        // Verb prefix not stripped if remainder is too short
        node_assert_1.default.deepStrictEqual((0, utility_1.cleanComponentName)('get_ab'), 'get_ab');
        node_assert_1.default.deepStrictEqual((0, utility_1.cleanComponentName)('post_it'), 'post_it');
        // No suffix or prefix: unchanged
        node_assert_1.default.deepStrictEqual((0, utility_1.cleanComponentName)('user'), 'user');
        node_assert_1.default.deepStrictEqual((0, utility_1.cleanComponentName)('gas_balance'), 'gas_balance');
        // Both suffix and prefix: suffix stripped first, then prefix
        node_assert_1.default.deepStrictEqual((0, utility_1.cleanComponentName)('get_user_response'), 'user');
        node_assert_1.default.deepStrictEqual((0, utility_1.cleanComponentName)('get_balance_controller'), 'balance');
    });
    (0, node_test_1.test)('ensureMinEntityName', () => {
        // Names already >= 3 chars are unchanged
        node_assert_1.default.deepStrictEqual((0, utility_1.ensureMinEntityName)('foo', {}), 'foo');
        node_assert_1.default.deepStrictEqual((0, utility_1.ensureMinEntityName)('abcd', {}), 'abcd');
        node_assert_1.default.deepStrictEqual((0, utility_1.ensureMinEntityName)('abc', {}), 'abc');
        // 2-char names get padded with "n"
        node_assert_1.default.deepStrictEqual((0, utility_1.ensureMinEntityName)('ab', {}), 'abn');
        node_assert_1.default.deepStrictEqual((0, utility_1.ensureMinEntityName)('dc', {}), 'dcn');
        // 1-char names get padded with "nt"
        node_assert_1.default.deepStrictEqual((0, utility_1.ensureMinEntityName)('d', {}), 'dnt');
        node_assert_1.default.deepStrictEqual((0, utility_1.ensureMinEntityName)('x', {}), 'xnt');
        // Empty string gets padded
        node_assert_1.default.deepStrictEqual((0, utility_1.ensureMinEntityName)('', {}), 'nt');
        // No collision: padded name is free
        node_assert_1.default.deepStrictEqual((0, utility_1.ensureMinEntityName)('ab', { other: {} }), 'abn');
        // Collision: padded name already taken by a different entity
        node_assert_1.default.deepStrictEqual((0, utility_1.ensureMinEntityName)('ab', { abn: {} }), 'abn2');
        node_assert_1.default.deepStrictEqual((0, utility_1.ensureMinEntityName)('ab', { abn: {}, abn2: {} }), 'abn3');
        // No collision when original name is already in entmap (same entity, re-entry)
        node_assert_1.default.deepStrictEqual((0, utility_1.ensureMinEntityName)('foo', { foo: {} }), 'foo');
        // Short name that doesn't collide after padding
        node_assert_1.default.deepStrictEqual((0, utility_1.ensureMinEntityName)('d', { other: {} }), 'dnt');
        // Short name that collides after padding
        node_assert_1.default.deepStrictEqual((0, utility_1.ensureMinEntityName)('d', { dnt: {} }), 'dnt2');
        node_assert_1.default.deepStrictEqual((0, utility_1.ensureMinEntityName)('d', { dnt: {}, dnt2: {} }), 'dnt3');
        // Names starting with a digit get "n" prefix
        node_assert_1.default.deepStrictEqual((0, utility_1.ensureMinEntityName)('510k', {}), 'n510k');
        node_assert_1.default.deepStrictEqual((0, utility_1.ensureMinEntityName)('3d_model', {}), 'n3d_model');
        node_assert_1.default.deepStrictEqual((0, utility_1.ensureMinEntityName)('0day', {}), 'n0day');
        // Digit prefix also satisfies min-length
        node_assert_1.default.deepStrictEqual((0, utility_1.ensureMinEntityName)('9', {}), 'n9n');
        node_assert_1.default.deepStrictEqual((0, utility_1.ensureMinEntityName)('42', {}), 'n42');
        // Non-digit names are not prefixed
        node_assert_1.default.deepStrictEqual((0, utility_1.ensureMinEntityName)('abc', {}), 'abc');
        // Leading underscores are stripped, then digit prefix applies
        node_assert_1.default.deepStrictEqual((0, utility_1.ensureMinEntityName)('_123', {}), 'n123');
        node_assert_1.default.deepStrictEqual((0, utility_1.ensureMinEntityName)('__foo', {}), 'foo');
        // Digit prefix with collision
        node_assert_1.default.deepStrictEqual((0, utility_1.ensureMinEntityName)('510k', { n510k: {} }), 'n510k2');
        // Non-alphanumeric characters are removed (keeping _)
        node_assert_1.default.deepStrictEqual((0, utility_1.ensureMinEntityName)('foo-bar', {}), 'foobar');
        node_assert_1.default.deepStrictEqual((0, utility_1.ensureMinEntityName)('hello.world', {}), 'helloworld');
        node_assert_1.default.deepStrictEqual((0, utility_1.ensureMinEntityName)('a!b@c#d', {}), 'abcd');
        node_assert_1.default.deepStrictEqual((0, utility_1.ensureMinEntityName)('foo_bar', {}), 'foo_bar');
        node_assert_1.default.deepStrictEqual((0, utility_1.ensureMinEntityName)('a[b]', {}), 'abn');
        // Names under 67 chars are unchanged
        node_assert_1.default.deepStrictEqual((0, utility_1.ensureMinEntityName)('this_endpoint_is_tailored_for_searches_based_on_product_name', {}), 'this_endpoint_is_tailored_for_searches_based_on_product_name');
        // Sentence-length names are truncated to <= 67 chars at word boundaries
        node_assert_1.default.deepStrictEqual((0, utility_1.ensureMinEntityName)('if_you_have_the_name_of_a_specific_software_product_and_want_to_check', {}), 'if_you_have_the_name_of_a_specific_software_product_and_want_to');
        node_assert_1.default.deepStrictEqual((0, utility_1.ensureMinEntityName)('this_is_a_very_long_entity_name_that_goes_well_beyond_the_sixty_seven_character_limit_set', {}), 'this_is_a_very_long_entity_name_that_goes_well_beyond_the_sixty');
        // Names at exactly 67 chars are unchanged
        node_assert_1.default.deepStrictEqual((0, utility_1.ensureMinEntityName)('a'.repeat(67), {}), 'a'.repeat(67));
        // Names at 68 chars get truncated
        node_assert_1.default.deepStrictEqual((0, utility_1.ensureMinEntityName)('abcde_' + 'x'.repeat(63), {}), 'abcde');
        // Single long word with no underscores gets hard-truncated at 67
        node_assert_1.default.deepStrictEqual((0, utility_1.ensureMinEntityName)('a'.repeat(80), {}), 'a'.repeat(67));
        // Truncation with collision
        const truncated = 'if_you_have_the_name_of_a_specific_software_product_and_want_to';
        node_assert_1.default.deepStrictEqual((0, utility_1.ensureMinEntityName)('if_you_have_the_name_of_a_specific_software_product_and_want_to_check', { [truncated]: {} }), truncated + '2');
    });
    (0, node_test_1.test)('pathMatch', async () => {
        const pmf = (p, x) => {
            const r = (0, utility_1.pathMatch)(p, x);
            return null === r ? r : { i: r.index, m: r.slice(0), x: r.expr };
        };
        node_assert_1.default.deepStrictEqual(pmf('/api/foo0', '/t/t/'), {
            i: 0, m: ['api', 'foo0'], x: '/t/t/'
        });
        node_assert_1.default.deepStrictEqual(pmf('/api/foo0n', '/t/'), null);
        node_assert_1.default.deepStrictEqual(pmf('/api/foo0n', '/t/t/t/'), null);
        node_assert_1.default.deepStrictEqual(pmf('/api/foo0n', 'p/'), null);
        node_assert_1.default.deepStrictEqual(pmf('/api/foo0n', 't/p/'), null);
        node_assert_1.default.deepStrictEqual(pmf('/api/foo0n', '/t/p/'), null);
        node_assert_1.default.deepStrictEqual(pmf('/api/foo1/', '/t/t/'), {
            m: ['api', 'foo1'], i: 0, x: '/t/t/'
        });
        node_assert_1.default.deepStrictEqual(pmf('api/foo2/', '/t/t/'), {
            m: ['api', 'foo2'], i: 0, x: '/t/t/'
        });
        node_assert_1.default.deepStrictEqual(pmf('api/foo3', '/t/t/'), {
            m: ['api', 'foo3'], i: 0, x: '/t/t/'
        });
        node_assert_1.default.deepStrictEqual(pmf('/foo4', '/t/'), {
            m: ['foo4'], i: 0, x: '/t/'
        });
        node_assert_1.default.deepStrictEqual(pmf('/foo5/', '/t/'), {
            m: ['foo5'], i: 0, x: '/t/'
        });
        node_assert_1.default.deepStrictEqual(pmf('foo6/', '/t/'), {
            m: ['foo6'], i: 0, x: '/t/'
        });
        node_assert_1.default.deepStrictEqual(pmf('foo7', '/t/'), {
            m: ['foo7'], i: 0, x: '/t/'
        });
        node_assert_1.default.deepStrictEqual(pmf('a0/{p0}', '/t/p/'), {
            m: ['a0', '{p0}'], i: 0, x: '/t/p/'
        });
        node_assert_1.default.deepStrictEqual(pmf('{p1}/a1/', '/p/t/'), {
            m: ['{p1}', 'a1'], i: 0, x: '/p/t/'
        });
        node_assert_1.default.deepStrictEqual(pmf('/a/b/c', '/t'), {
            m: ['a'], i: 0, x: '/t'
        });
        node_assert_1.default.deepStrictEqual(pmf('/a/b/c', 't'), {
            m: ['a'], i: 0, x: 't'
        });
        node_assert_1.default.deepStrictEqual(pmf('/a/b/c', 't/'), {
            m: ['c'], i: 2, x: 't/'
        });
        node_assert_1.default.deepStrictEqual(pmf('/a/b/c', 't/t/'), {
            m: ['b', 'c'], i: 1, x: 't/t/'
        });
        node_assert_1.default.deepStrictEqual(pmf('/a/b/{c}', 't/p/'), {
            m: ['b', '{c}'], i: 1, x: 't/p/'
        });
        node_assert_1.default.deepStrictEqual(pmf('/a/b/{c}', 'p/'), {
            m: ['{c}'], i: 2, x: 'p/'
        });
        node_assert_1.default.deepStrictEqual(pmf('/a/b/{c}', 't/'), null);
        node_assert_1.default.deepStrictEqual(pmf('/a/b/{c}/d', 't/p'), {
            m: ['b', '{c}'], i: 1, x: 't/p'
        });
        node_assert_1.default.deepStrictEqual(pmf('/a/b/{c}/d', 'p/t'), {
            m: ['{c}', 'd'], i: 2, x: 'p/t'
        });
        node_assert_1.default.deepStrictEqual(pmf('/a/b/{c}/d', 'p/t/'), {
            m: ['{c}', 'd'], i: 2, x: 'p/t/'
        });
        node_assert_1.default.deepStrictEqual(pmf('/a/b/{c}/d/e', 'p/t/'), null);
        node_assert_1.default.deepStrictEqual(pmf('/a/b/{c}/d/e', 'p/t'), {
            i: 2, m: ['{c}', 'd'], x: 'p/t'
        });
        node_assert_1.default.deepStrictEqual(pmf('/a/b/{c}/d/{e}', 't/p/'), {
            i: 3, m: ['d', '{e}'], x: 't/p/'
        });
        node_assert_1.default.deepStrictEqual(pmf('/a/b/{c}/d/{e}', 't/p'), {
            i: 1, m: ['b', '{c}'], x: 't/p'
        });
        node_assert_1.default.deepStrictEqual(pmf('/a/b/{c}/d/{e}', '/t/p'), null);
        node_assert_1.default.deepStrictEqual(pmf('/a/b/{c}/d/{e}', 't/p/t/p'), {
            i: 1, m: ['b', '{c}', 'd', '{e}'], x: 't/p/t/p'
        });
    });
    (0, node_test_1.test)('formatJSONIC', async () => {
        node_assert_1.default.deepStrictEqual((0, utility_1.formatJSONIC)(), '');
        node_assert_1.default.deepStrictEqual((0, utility_1.formatJSONIC)(undefined), '');
        node_assert_1.default.deepStrictEqual((0, utility_1.formatJSONIC)(null), 'null\n');
        node_assert_1.default.deepStrictEqual((0, utility_1.formatJSONIC)(true), 'true\n');
        node_assert_1.default.deepStrictEqual((0, utility_1.formatJSONIC)(11), '11\n');
        node_assert_1.default.deepStrictEqual((0, utility_1.formatJSONIC)("s"), '"s"\n');
        node_assert_1.default.deepStrictEqual((0, utility_1.formatJSONIC)({
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
        }), `{
  a: 1  # note about a
  "0b": {  # 0b notes
    _CUR: "dollar"  # x; y
  }

}
`);
        const a0 = [100, 101, 102];
        a0['0_COMMENT'] = 'zero';
        a0['2_COMMENT'] = 'two';
        node_assert_1.default.deepStrictEqual((0, utility_1.formatJSONIC)({ a: a0, a_COMMENT: 'array' }), `{
  a: [  # array
    100  # zero
    101
    102  # two
  ]

}
`);
        node_assert_1.default.deepStrictEqual((0, utility_1.formatJSONIC)({ _COMMENT: 'topO' }), `{  # topO
}
`);
        const a1 = [];
        a1._COMMENT = 'topA';
        node_assert_1.default.deepStrictEqual((0, utility_1.formatJSONIC)(a1), `[  # topA
]
`);
        node_assert_1.default.deepStrictEqual((0, utility_1.formatJSONIC)({ a: { b: {}, c: [], d: {} }, e: {} }), `{
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
        node_assert_1.default.deepStrictEqual((0, utility_1.formatJSONIC)({ a1: { b1: {}, c1: [], d1: {} }, e1: {} }, { hsepd: 2 }), `{
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
        node_assert_1.default.deepStrictEqual((0, utility_1.getModelPath)(model, 'a'), model.a);
        node_assert_1.default.deepStrictEqual((0, utility_1.getModelPath)(model, 'a.b'), model.a.b);
        node_assert_1.default.deepStrictEqual((0, utility_1.getModelPath)(model, 'a.b.c'), 'value');
    });
    (0, node_test_1.test)('getModelPath - array indexing', () => {
        const model = {
            items: [
                { name: 'first', value: 1 },
                { name: 'second', value: 2 },
                { name: 'third', value: 3 }
            ]
        };
        node_assert_1.default.deepStrictEqual((0, utility_1.getModelPath)(model, 'items.0'), model.items[0]);
        node_assert_1.default.deepStrictEqual((0, utility_1.getModelPath)(model, 'items.1'), model.items[1]);
        node_assert_1.default.deepStrictEqual((0, utility_1.getModelPath)(model, 'items.2'), model.items[2]);
        node_assert_1.default.deepStrictEqual((0, utility_1.getModelPath)(model, 'items.0.name'), 'first');
        node_assert_1.default.deepStrictEqual((0, utility_1.getModelPath)(model, 'items.1.value'), 2);
        node_assert_1.default.deepStrictEqual((0, utility_1.getModelPath)(model, 'items.2.name'), 'third');
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
        node_assert_1.default.deepStrictEqual((0, utility_1.getModelPath)(model, 'data.nested.0.items.0.id'), 'a');
        node_assert_1.default.deepStrictEqual((0, utility_1.getModelPath)(model, 'data.nested.0.items.1.id'), 'b');
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
            node_assert_1.default.fail('Should not reach here');
        }
        catch (err) {
            node_assert_1.default.match(err.message, new RegExp("path not found at 'a.x.c'"));
            node_assert_1.default.match(err.message, new RegExp("Valid path up to: 'a'"));
            node_assert_1.default.match(err.message, new RegExp("Property 'x' does not exist"));
            node_assert_1.default.match(err.message, new RegExp("Available keys: \\[b\\]"));
        }
        // Missing final key - should show available keys
        try {
            (0, utility_1.getModelPath)(model, 'a.missing');
            node_assert_1.default.fail('Should not reach here');
        }
        catch (err) {
            node_assert_1.default.match(err.message, new RegExp("path not found at 'a.missing'"));
            node_assert_1.default.match(err.message, new RegExp("Valid path up to: 'a'"));
            node_assert_1.default.match(err.message, new RegExp("Property 'missing' does not exist"));
            node_assert_1.default.match(err.message, new RegExp("Available keys: \\[b\\]"));
        }
        // Missing root key
        try {
            (0, utility_1.getModelPath)(model, 'missing');
            node_assert_1.default.fail('Should not reach here');
        }
        catch (err) {
            node_assert_1.default.match(err.message, new RegExp("path not found at 'missing'"));
            node_assert_1.default.match(err.message, new RegExp("Valid path up to: '\\(root\\)'"));
            node_assert_1.default.match(err.message, new RegExp("Property 'missing' does not exist"));
            node_assert_1.default.match(err.message, new RegExp("Available keys: \\[a\\]"));
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
            node_assert_1.default.fail('Should not reach here');
        }
        catch (err) {
            node_assert_1.default.match(err.message, new RegExp("path not found at 'a.b.c'"));
            node_assert_1.default.match(err.message, new RegExp("Valid path up to: 'a.b'"));
            node_assert_1.default.match(err.message, new RegExp("Cannot access property 'c' of null"));
        }
        const model2 = {
            a: {
                b: undefined
            }
        };
        try {
            (0, utility_1.getModelPath)(model2, 'a.b.c');
            node_assert_1.default.fail('Should not reach here');
        }
        catch (err) {
            node_assert_1.default.match(err.message, new RegExp("path not found at 'a.b.c'"));
            node_assert_1.default.match(err.message, new RegExp("Valid path up to: 'a.b'"));
            node_assert_1.default.match(err.message, new RegExp("Cannot access property 'c' of undefined"));
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
            node_assert_1.default.fail('Should not reach here');
        }
        catch (err) {
            node_assert_1.default.match(err.message, new RegExp("path not found at 'items.5'"));
            node_assert_1.default.match(err.message, new RegExp("Valid path up to: 'items'"));
            node_assert_1.default.match(err.message, new RegExp("Property '5' does not exist"));
            node_assert_1.default.match(err.message, new RegExp("Available keys: array indices 0-1"));
        }
    });
    (0, node_test_1.test)('getModelPath - required:false returns undefined on missing path', () => {
        const model = {
            a: {
                b: 'value'
            }
        };
        node_assert_1.default.deepStrictEqual((0, utility_1.getModelPath)(model, 'a.x.c', { required: false }), undefined);
        node_assert_1.default.deepStrictEqual((0, utility_1.getModelPath)(model, 'a.missing', { required: false }), undefined);
        node_assert_1.default.deepStrictEqual((0, utility_1.getModelPath)(model, 'missing', { required: false }), undefined);
        node_assert_1.default.deepStrictEqual((0, utility_1.getModelPath)(model, 'a.b.c', { required: false }), undefined);
    });
    (0, node_test_1.test)('getModelPath - required:false returns undefined on null/undefined in path', () => {
        const model = {
            a: {
                b: null
            }
        };
        node_assert_1.default.deepStrictEqual((0, utility_1.getModelPath)(model, 'a.b.c', { required: false }), undefined);
        const model2 = {
            a: {
                b: undefined
            }
        };
        node_assert_1.default.deepStrictEqual((0, utility_1.getModelPath)(model2, 'a.b.c', { required: false }), undefined);
    });
    (0, node_test_1.test)('getModelPath - required:false returns undefined for array out of bounds', () => {
        const model = {
            items: [{ name: 'first' }]
        };
        node_assert_1.default.deepStrictEqual((0, utility_1.getModelPath)(model, 'items.5', { required: false }), undefined);
        node_assert_1.default.deepStrictEqual((0, utility_1.getModelPath)(model, 'items.5.name', { required: false }), undefined);
    });
    (0, node_test_1.test)('getModelPath - empty path handling', () => {
        const model = { a: 'value' };
        try {
            (0, utility_1.getModelPath)(model, '');
            node_assert_1.default.fail('Should not reach here');
        }
        catch (err) {
            node_assert_1.default.match(err.message, new RegExp('empty path provided'));
        }
        node_assert_1.default.deepStrictEqual((0, utility_1.getModelPath)(model, '', { required: false }), undefined);
    });
    (0, node_test_1.test)('getModelPath - returns actual values including falsy ones', () => {
        const model = {
            zero: 0,
            empty: '',
            falsy: false,
            nullValue: null
        };
        node_assert_1.default.deepStrictEqual((0, utility_1.getModelPath)(model, 'zero'), 0);
        node_assert_1.default.deepStrictEqual((0, utility_1.getModelPath)(model, 'empty'), '');
        node_assert_1.default.deepStrictEqual((0, utility_1.getModelPath)(model, 'falsy'), false);
        node_assert_1.default.deepStrictEqual((0, utility_1.getModelPath)(model, 'nullValue'), null);
    });
});
//# sourceMappingURL=utility.test.js.map