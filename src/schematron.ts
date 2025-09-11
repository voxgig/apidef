type JSONSchema = Record<string, any>;

type ConvertOptions = {
  /** Where to resolve $ref from. Use your OpenAPI doc’s components.schemas, or JSON Schema $defs. */
  refRoots?: Array<Record<string, JSONSchema>>;
  /** Optional: pass the entire root doc; only used if your $ref are absolute like #/components/schemas/X */
  rootDoc?: Record<string, any>;
};

const TYPE_TOKEN: Record<string, string> = {
  string: "$STRING",
  number: "$NUMBER",
  integer: "$INTEGER",
  boolean: "$BOOLEAN",
  null: "$NULL",
};

export function convert(
  schema: JSONSchema | undefined,
  opts: ConvertOptions = {}
): any {
  const seen = new Set<JSONSchema>(); // avoid accidental infinite loops on bad refs

  const resolveRef = ($ref: string): JSONSchema | undefined => {
    if (!$ref.startsWith("#/")) return undefined; // non-local refs not supported per spec; return undefined to fallback
    const parts = $ref.slice(2).split("/").map(unescapeRefToken);
    let node: any = opts.rootDoc ?? {};
    for (const p of parts) node = node?.[p];
    if (node) return node;

    // Try common roots passed in refRoots (e.g., components.schemas, $defs)
    for (const root of opts.refRoots ?? []) {
      let probe: any = root;
      for (const p of parts) probe = probe?.[p];
      if (probe) return probe;
    }
    return undefined;
  };

  const expandRef = (sch: JSONSchema): JSONSchema => {
    if (typeof sch?.$ref === "string") {
      const target = resolveRef(sch.$ref);
      if (target) return target;
      // Not supported → per rule 10, “just expand the reference”; if we cannot, fall back to ANY.
      return {};
    }
    return sch;
  };

  function convert(s: JSONSchema | undefined): any {
    if (!s || Object.keys(s).length === 0) {
      // Rule 13 – empty schema accepts anything
      return "$ANY";
    }

    // Prevent cycles from blowing the stack on malformed docs
    if (seen.has(s)) return "$ANY";
    seen.add(s);

    // // Expand $ref immediately (Rule 10)
    // if (s.$ref) {
    //   const tgt = expandRef(s);
    //   // Merge local decorations on top of the ref target (common in OAS)
    //   const merged = { ...tgt, ...without(s, ["$ref"]) };
    //   const out = convert(merged);
    //   seen.delete(s);
    //   return out;
    // }


    // Expand $ref immediately (Rule 10)
    if (s.$ref) {
      const target = expandRef(s);
      const localDecor = without(s, ["$ref"]); // local fields that decorate the ref
      // Use the same semantics as allOf merging to deep-merge properties/openness/etc.
      const merged = mergeAllOf([target, localDecor]);
      const out = convert(merged);
      seen.delete(s);
      return out;
    }

    // Composition
    if (Array.isArray(s.allOf) && s.allOf.length > 0) {
      const merged = mergeAllOf(s.allOf.map((x) => expandRef(x)));
      // Carry over top-level decorations (e.g., nullable, annotations)
      const mergedWithTop = { ...merged, ...without(s, ["allOf"]) };
      const out = convert(mergedWithTop);
      seen.delete(s);
      return out;
    }

    if (Array.isArray(s.oneOf) && s.oneOf.length > 0) {
      const alts = s.oneOf.map((x) => convert(expandRef(x)));
      const out = ["$ONE", ...alts];
      seen.delete(s);
      return out;
    }

    if (Array.isArray(s.anyOf) && s.anyOf.length > 0) {
      const alts = s.anyOf.map((x) => convert(expandRef(x)));
      const out = ["$ANY", ...alts]; // Rule 3 – anyOf uses "$ANY" in the same directive position
      seen.delete(s);
      return out;
    }

    // Enum / const → $EXACT
    if (Array.isArray(s.enum) && s.enum.length > 0) {
      const out = ["$EXACT", ...s.enum];
      seen.delete(s);
      return out;
    }
    if (Object.prototype.hasOwnProperty.call(s, "const")) {
      const out = ["$EXACT", s.const];
      seen.delete(s);
      return out;
    }

    // Handle OpenAPI nullable at this level by wrapping the base type later
    const nullable = s.nullable === true;

    // Type handling (could be string or array)
    const t = s.type;
    if (Array.isArray(t) && t.length > 0) {
      // Union of primitives (and possibly null)
      const tokens = t.map((tt) => TYPE_TOKEN[tt] ?? "$ANY");
      const out = ["$ONE", ...tokens];
      seen.delete(s);
      return out;
    }

    // Objects
    if (t === "object" || s.properties || s.additionalProperties !== undefined) {
      const obj: Record<string, any> = {};

      // $OPEN
      if (s.additionalProperties === true) {
        obj["$OPEN"] = true;
      } else if (s.additionalProperties && typeof s.additionalProperties === "object") {
        // We cannot express typed extras (Rule 6). Keep it open but untyped.
        obj["$OPEN"] = true;
      }
      // $NOTE annotations (Rule 11)
      const note: Record<string, any> = {};
      if (s.readOnly === true) note.readOnly = true;
      if (s.writeOnly === true) note.writeOnly = true;
      if (s.deprecated === true) note.deprecated = true;
      if (Object.keys(note).length > 0) obj["$NOTE"] = note;

      const props = s.properties ?? {};
      for (const [key, sub] of Object.entries<JSONSchema>(props)) {
        const converted = convert(expandRef(sub));
        const isNullable =
          sub?.nullable === true ||
          (Array.isArray(sub?.type) && sub.type.includes("null")) ||
          includesNullViaOneAnyOf(sub);

        obj[key] = isNullable ? wrapNullable(converted) : converted;
      }

      seen.delete(s);
      return obj;
    }

    // Arrays
    if (t === "array" || s.items) {
      const items = s.items;
      if (Array.isArray(items)) {
        // Tuple validation → positional sub-schemas
        const out = items.map((it) => convert(expandRef(it)));
        seen.delete(s);
        return out;
      } else if (items && typeof items === "object") {
        // Homogeneous array → ["$CHILD", sub]
        const out = ["$CHILD", convert(expandRef(items))];
        seen.delete(s);
        return out;
      } else {
        // No items → accept any child element
        seen.delete(s);
        return [];
      }
    }

    // Primitives
    if (typeof t === "string" && TYPE_TOKEN[t]) {
      const token = TYPE_TOKEN[t];
      const base = token;

      const out = nullable ? wrapNullable(base) : base;
      seen.delete(s);
      return out;
    }

    // No explicit type, but we might still infer:
    if (s.properties || s.additionalProperties !== undefined) {
      // already handled in object branch, but keep a guard
      const out = convert({ ...s, type: "object" });
      seen.delete(s);
      return out;
    }
    if (s.items) {
      const out = convert({ ...s, type: "array" });
      seen.delete(s);
      return out;
    }

    // Fallback
    seen.delete(s);
    return "$ANY";
  }

  const result = convert(schema);
  return result;
}

/* -------------------------- helpers -------------------------- */

function unescapeRefToken(s: string) {
  // JSON Pointer ~0 -> ~, ~1 -> /
  return s.replace(/~1/g, "/").replace(/~0/g, "~");
}

function without<T extends Record<string, any>>(obj: T, keys: string[]): T {
  const copy: any = {};
  for (const k of Object.keys(obj)) if (!keys.includes(k)) copy[k] = obj[k];
  return copy;
}

function includesNullViaOneAnyOf(s: JSONSchema): boolean {
  const hasNullIn = (arr?: any[]) =>
    Array.isArray(arr) &&
    arr.some((x) => x?.type === "null" || (Array.isArray(x?.type) && x.type.includes("null")));
  return hasNullIn(s.oneOf) || hasNullIn(s.anyOf);
}

function wrapNullable(inner: any) {
  // Rule 1/4 – nullable → ["$ONE", inner, "$NULL"]
  return Array.isArray(inner) && inner[0] === "$ONE"
    ? inner.includes("$NULL")
      ? inner
      : ["$ONE", ...inner.slice(1), "$NULL"]
    : ["$ONE", inner, "$NULL"];
}

/** Merge for allOf (Rule 3): shallow-merge types, deep-merge object properties, OR them sensibly. */
function mergeAllOf(schemas: JSONSchema[]): JSONSchema {
  const out: JSONSchema = {};
  let anyObject = false;

  for (const s of schemas) {
    // Merge top-level flags relevant to objects
    if (s.type === "object" || s.properties || s.additionalProperties !== undefined) {
      anyObject = true;
      out.type = "object";
      out.properties = { ...(out.properties ?? {}), ...(s.properties ?? {}) };

      // Decide openness: if any parent is open, keep open
      const ap = s.additionalProperties;
      if (ap === true || (typeof ap === "object" && ap)) {
        out.additionalProperties = true;
      } else if (out.additionalProperties === undefined) {
        // carry forward exact false only if no previous true
        out.additionalProperties = ap;
      }

      // Keep a union of required (best-effort; not represented in struct anyway)
      const req = new Set([...(out.required ?? []), ...(s.required ?? [])]);
      if (req.size) out.required = Array.from(req);
    } else {
      // For non-object shapes in allOf, we can’t represent intersections well → best-effort carry
      Object.assign(out, s);
    }
  }

  // If nothing indicated object, fall back to last schema (still consistent with “merge”)
  return anyObject ? out : (schemas.reduce((a, b) => ({ ...a, ...b }), {}) as JSONSchema);
}

/* -------------------------- Example usage --------------------------
import openapi from "./openapi.json";

const vox = convertToVoxgigStruct(
  openapi.components.schemas.User,
  {
    rootDoc: openapi,
    refRoots: [openapi.components?.schemas ?? {}, openapi.$defs ?? {}],
  }
);
console.log(JSON.stringify(vox, null, 2));
------------------------------------------------------------------- */
