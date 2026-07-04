
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

  return { ok: true, msg: 'top' }
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
// Apidef's downstream schema (apidef.jsonic) unifies info fields as
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
  topTransform
}


// export type {
//   GuideEntity,
// }
