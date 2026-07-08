
import { join } from '@voxgig/struct'

import { KIT } from '../types'

import type { TransformResult } from '../transform'

import type {
  KitModel,
} from '../types'

import type {
  // GuidePath,
  PathDesc,
  OpDesc,
} from '../desc'

import type {
  OpName,
} from '../model'


// Guide* => from guide model
// *Desc => internal working descriptiuon
// *Def => API spec definition
// Model* => Generated SDK Model


// type GuideEntity = {
//   name: string,
//   path: Record<string, GuidePath>

//   paths$: PathDesc[]
//   opm$: Record<OpName, OpDesc>
// }


const topTransform = async function(
  ctx: any,
): Promise<TransformResult> {
  const { apimodel, def } = ctx
  const kit: KitModel = apimodel.main[KIT]

  kit.info = stringifyInfoScalars(def.info ?? {})
  kit.info.servers = stringifyInfoScalars(def.servers ?? [])

  // Public APIs that declare NO authentication (no security schemes, no
  // top-level `security`, and no per-operation `security`) get an explicit
  // no-auth signal in the model. Downstream sdkgen reads it via
  // isAuthActive() (main.kit.info.auth === false) to suppress apikey/auth
  // code, docs and examples. Only the negative signal is emitted: when the
  // spec DOES declare auth we leave `auth` unset so the SDK's own config
  // (main.kit.config.auth) governs. Set AFTER stringifyInfoScalars so the
  // value stays a real boolean rather than the string "false".
  if (!specDeclaresAuth(def)) {
    kit.info.auth = false
  }
  else {
    // Describe the primary security scheme so generators can emit the
    // API's actual credential format instead of assuming `Bearer` —
    // e.g. Statuspage documents `Authorization: OAuth <key>`.
    const security = resolveSecurity(def)
    if (null != security) {
      kit.info.security = security
    }
  }

  // Swagger 2.0
  if (def.host) {
    kit.info.servers.push({
      url: (def.schemes?.[0] ?? 'https') + '://' + join([def.host, def.basePath], '/', true)
    })
  }

  // Some specs omit the scheme on `servers[].url` — e.g. the Art
  // Institute of Chicago lists `api.artic.edu/api/v1` (no
  // https://). Go's net/http barfs on that with "unsupported
  // protocol scheme". Default to https when the URL has no scheme
  // and the value isn't a relative path.
  for (const server of (kit.info.servers as any[])) {
    if (!server || 'string' !== typeof server.url) continue
    const url: string = server.url.trim()
    if (url === '') continue
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) continue   // already has scheme
    // `//host/path` is a protocol-relative URL — meaningless to a
    // backend SDK, treat as missing-scheme and default to https.
    if (url.startsWith('//')) {
      server.url = 'https:' + url
      continue
    }
    // `/path` is path-only (relative to wherever the spec is served).
    // Leave it untouched; it's a valid OpenAPI form.
    if (url.startsWith('/')) continue
    server.url = 'https://' + url
  }

  // A usable SDK requires a base URL. OpenAPI 3 puts it in `servers[].url`;
  // Swagger 2 derives it from `host` + `basePath`. If neither yields a
  // non-empty url, the generated SDK has no way to issue requests, so fail
  // the apidef model build rather than emit broken code.
  const firstServerUrl: any = kit.info.servers?.[0]?.url
  if (null == firstServerUrl || '' === String(firstServerUrl).trim()) {
    throw new Error(
      'apidef: no server URL found in API definition (servers[0].url is required).'
    )
  }

  // A short "what this API is" blurb and a canonical website link, for doc
  // generators. Only set when derivable, so downstream can gate on them.
  const summary = resolveSummary(def)
  if (null != summary) {
    kit.info.summary = summary
  }
  const website = resolveWebsite(def, kit.info.servers as any[])
  if (null != website) {
    kit.info.website = website
  }

  return { ok: true, msg: 'top' }
}


// A short one-line description of the API's purpose: the spec's
// `info.summary` (OpenAPI 3.1) when present, else the first prose sentence
// of `info.description` with leading markdown headings/blank lines stripped
// and the length capped. Returns undefined when no usable prose exists
// (e.g. GitLab, whose top-level description is empty).
function resolveSummary(def: any): string | undefined {
  const info = def?.info ?? {}

  const explicit = 'string' === typeof info.summary ? info.summary.trim() : ''
  if ('' !== explicit) {
    return firstSentence(explicit)
  }

  const desc = 'string' === typeof info.description ? info.description : ''
  if ('' === desc.trim()) {
    return undefined
  }

  const lines = desc.split('\n')
  let i = 0
  // Skip leading blank lines, ATX headings (`# ...`) and setext underlines.
  while (i < lines.length &&
    ('' === lines[i].trim() ||
      /^\s*#{1,6}\s/.test(lines[i]) ||
      /^\s*(-{2,}|={2,})\s*$/.test(lines[i]))) {
    i++
  }
  // Take the first paragraph (up to the next blank line or heading).
  const para: string[] = []
  while (i < lines.length &&
    '' !== lines[i].trim() &&
    !/^\s*#{1,6}\s/.test(lines[i])) {
    para.push(lines[i].trim())
    i++
  }
  const paragraph = para.join(' ').trim()
  return '' === paragraph ? undefined : firstSentence(paragraph)
}


// The first sentence of `text` (up to a `.`/`!`/`?` followed by whitespace
// or end), whitespace-collapsed and length-capped with an ellipsis.
function firstSentence(text: string): string {
  const collapsed = text.replace(/\s+/g, ' ').trim()
  const m = collapsed.match(/^(.+?[.!?])(\s|$)/)
  let out = m ? m[1] : collapsed
  const MAX = 240
  if (out.length > MAX) {
    out = out.slice(0, MAX - 1).trimEnd() + '…'
  }
  return out
}


// A canonical link back to the API's own website, in priority order:
//   1. externalDocs.url          (the spec's explicit external link)
//   2. info['x-logo'].href       (redoc homepage link)
//   3. homepage from the server  (strip an api./developer./docs. subdomain)
//   4. info.contact.url
//   5. info.termsOfService
function resolveWebsite(def: any, servers: any[]): string | undefined {
  const info = def?.info ?? {}

  const ext = def?.externalDocs?.url
  if (isHttpUrl(ext)) return ext.trim()

  const logoHref = info['x-logo']?.href
  if (isHttpUrl(logoHref)) return logoHref.trim()

  const home = homepageFromServer(servers?.[0]?.url)
  if (null != home) return home

  if (isHttpUrl(info.contact?.url)) return info.contact.url.trim()
  if (isHttpUrl(info.termsOfService)) return info.termsOfService.trim()

  return undefined
}


// Derive a homepage from an API server URL by dropping the path and an
// `api.` / `developer.` / `docs.` / `www.` service subdomain — e.g.
// `https://api.thesmsworks.co.uk/v1` -> `https://thesmsworks.co.uk`.
function homepageFromServer(url: any): string | undefined {
  if ('string' !== typeof url || '' === url.trim()) return undefined
  try {
    const u = new URL(url.includes('://') ? url : 'https://' + url)
    let host = u.hostname
    if ('' === host || !host.includes('.')) return undefined
    host = host.replace(
      /^(api|api-[a-z0-9]+|apis|developer|developers|docs?|www)\./i, '')
    return u.protocol + '//' + host
  }
  catch (_e) {
    return undefined
  }
}


function isHttpUrl(v: any): boolean {
  return 'string' === typeof v && /^https?:\/\//i.test(v.trim())
}


// Describe the spec's PRIMARY security scheme as model facts
// (info.security): scheme key, type, where the credential goes (in/name),
// and the value prefix for Authorization-header credentials. The primary
// scheme is the one named by the first top-level `security` requirement,
// falling back to the first declared scheme. Returns null when nothing
// usable is declared (the no-auth signal is handled separately).
//
// Prefix rules:
//   http basic/bearer      -> 'Basic' / 'Bearer'
//   oauth2 / openIdConnect -> 'Bearer' (access token in Authorization)
//   apiKey in an Authorization header -> the prefix the API's own prose
//     documents (e.g. `Authorization: OAuth <key>`), else '' (raw). An
//     `apiKey` scheme means "send the credential as-is" — a `Bearer`/etc.
//     prefix is only implied by an `http`+`bearer` scheme or explicit
//     prose, so absent evidence the key goes in raw (e.g. The SMS Works'
//     `Authorization: <jwt>`). A user override is available via
//     config.auth.prefix.
//   apiKey in any other header/query/cookie -> '' (raw credential)
function resolveSecurity(def: any): Record<string, string> | null {
  const schemes: Record<string, any> =
    def.components?.securitySchemes ?? def.securityDefinitions ?? {}

  let schemeName: string | undefined =
    Array.isArray(def.security) && def.security[0] &&
      'object' === typeof def.security[0] ?
      Object.keys(def.security[0])[0] : undefined

  if (null == schemeName || null == schemes[schemeName]) {
    schemeName = Object.keys(schemes)[0]
  }

  const scheme = null == schemeName ? null : schemes[schemeName]
  if (null == scheme || 'object' !== typeof scheme) {
    return null
  }

  const type = String(scheme.type ?? '').toLowerCase()

  const out: Record<string, string> = {
    scheme: schemeName as string,
    type: scheme.type ?? '',
    in: scheme.in ?? 'header',
    name: scheme.name ?? 'Authorization',
    prefix: '',
  }

  if ('http' === type) {
    // Swagger 2 `type: basic` has no `scheme`; OpenAPI 3 uses
    // `scheme: basic|bearer|...`.
    out.prefix = 'basic' === String(scheme.scheme ?? '').toLowerCase() ?
      'Basic' : 'Bearer'
  }
  else if ('basic' === type) {
    out.prefix = 'Basic'
  }
  else if ('oauth2' === type || 'openidconnect' === type) {
    out.in = 'header'
    out.name = 'Authorization'
    out.prefix = 'Bearer'
  }
  else if ('apikey' === type) {
    if ('header' === String(out.in).toLowerCase() &&
      'authorization' === String(out.name).toLowerCase()) {
      // Only adopt a prefix the API's prose actually documents; otherwise
      // the apiKey goes in raw (no assumed 'Bearer').
      out.prefix =
        findAuthPrefix(scheme.description) ??
        findAuthPrefix(def.info?.description) ??
        ''
    }
    // else: raw credential in a named header/query/cookie — no prefix.
  }

  return out
}


// Extract the credential prefix from a securityScheme's / info prose.
// Three signals, in confidence order:
//   1. An explicit `Authorization: <prefix> <cred>` line (any prefix word)
//      — e.g. Statuspage's `Authorization: OAuth 89a2...`. The prefix must
//      be a short word followed by something credential-shaped (a long
//      token, or a `<key>` / `{token}` / `$KEY` / `YOUR_...` placeholder),
//      so a bare `Authorization: 89a2...` doesn't match.
//   2. A KNOWN scheme word (Bearer/OAuth/Token/Basic) shown as an example
//      prefix — `Example: Bearer eyJ...` (NoFrixion's shape).
//   3. A KNOWN scheme word named as the scheme — `the Bearer scheme`,
//      `Bearer authentication`.
// Returns null when nothing indicates a prefix (an apiKey then goes in raw).
function findAuthPrefix(text: unknown): string | null {
  if ('string' !== typeof text || '' === text) {
    return null
  }

  const explicit = text.match(
    /Authorization:[ \t]*([A-Za-z][A-Za-z0-9._-]{0,14})[ \t]+(?:<[^>\n]+>|\{[^}\n]+\}|\$[A-Za-z_][A-Za-z0-9_]*|[Yy][Oo][Uu][Rr][A-Za-z0-9_-]*|[A-Za-z0-9._~+/=-]{8,})/)
  if (null != explicit) {
    return explicit[1]
  }

  // A known scheme word as an example prefix, then a credential-shaped tail.
  const example = text.match(
    /(?:example|e\.g\.)[:\s][^\n]{0,20}?\b(Bearer|OAuth2?|Token|Basic)\b[ \t]+(?:<[^>\n]+>|\{[^}\n]+\}|[A-Za-z0-9._~+/=-]{6,})/i)
  if (null != example) {
    return canonAuthScheme(example[1])
  }

  // A known scheme word named as the auth scheme.
  const named = text.match(
    /\b(Bearer|OAuth2?|Token|Basic)\b[ \t]+(?:scheme|authentication|auth\b|credentials?)/i)
  if (null != named) {
    return canonAuthScheme(named[1])
  }

  return null
}


// Canonical casing for a known scheme word (Bearer/OAuth/Token/Basic).
function canonAuthScheme(word: string): string {
  const w = word.toLowerCase()
  if (w.startsWith('oauth')) return 'OAuth'
  if ('bearer' === w) return 'Bearer'
  if ('token' === w) return 'Token'
  if ('basic' === w) return 'Basic'
  return word
}


// Does the spec declare any authentication? True if it defines security
// schemes (OpenAPI 3 `components.securitySchemes` or Swagger 2
// `securityDefinitions`), a top-level `security` requirement, or a
// per-operation `security` requirement. Used to emit a no-auth signal
// (info.auth: false) for fully public APIs.
function specDeclaresAuth(def: any): boolean {
  if (null == def || 'object' !== typeof def) return false

  const nonEmptyObj = (v: any) =>
    null != v && 'object' === typeof v && Object.keys(v).length > 0

  // OpenAPI 3 security schemes.
  if (nonEmptyObj(def.components?.securitySchemes)) return true

  // Swagger 2 security definitions.
  if (nonEmptyObj(def.securityDefinitions)) return true

  // Top-level security requirement.
  if (Array.isArray(def.security) && def.security.length > 0) return true

  // Per-operation security requirement.
  const paths = def.paths
  if (paths && 'object' === typeof paths) {
    for (const pathItem of Object.values(paths)) {
      if (null == pathItem || 'object' !== typeof pathItem) continue
      for (const op of Object.values(pathItem as Record<string, any>)) {
        if (op && 'object' === typeof op &&
          Array.isArray((op as any).security) && (op as any).security.length > 0) {
          return true
        }
      }
    }
  }

  return false
}


// OpenAPI's `info` object (and the `servers` array) declares every scalar
// leaf as a string. YAML/JSON parsers don't enforce that — `version: 2`
// without quotes parses as the number 2, `version: true` as a boolean.
// Apidef's downstream schema (apidef.aontu) unifies info fields as
// `string`, so non-string scalars cause an aontu unify failure during
// model resolution. Normalise scalar leaves to strings here, at the
// model-build boundary, rather than relax the schema.
function stringifyInfoScalars(node: any): any {
  if (null == node) return node
  if (Array.isArray(node)) return node.map(stringifyInfoScalars)
  if ('object' === typeof node) {
    const out: Record<string, any> = {}
    for (const [k, v] of Object.entries(node)) {
      out[k] = stringifyInfoScalars(v)
    }
    return out
  }
  if ('number' === typeof node || 'boolean' === typeof node) {
    return String(node)
  }
  return node
}


export {
  topTransform,
  resolveSecurity,
  resolveSummary,
  resolveWebsite,
  homepageFromServer,
  findAuthPrefix,
}


// export type {
//   GuideEntity,
// }
