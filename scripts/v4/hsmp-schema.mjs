/* hsmp-schema.mjs — v6.3.0-alpha.1 — Headless State Mutation Payload schema.
 *
 * The HSMP is the JSON contract between the Fast Interpreter (Step 2) and
 * the Frontend State Execution (Step 3) per Silent Canvas Doctrine §6.2.
 *
 * Every silent-canvas/run emits HSMPs that mutate the project graph (the
 * canonical canvas state) and stream events to the operator's Progress
 * Dashboard + Visual Telemetry Engine.
 *
 * Schema is intentionally STRICT — Fast Interpreter is supposed to produce
 * exactly this shape, no looseness. Validation is enforced; failures emit
 * `silent-canvas-parse-error` receipts.
 */

export const HSMP_SCHEMA_VERSION = "1.0";
export const HSMP_COMPAT_VERSION = "hsmp-1.0.0";
export const HSMP_PRIMITIVE_VERSION = "silent-canvas-primitives/v1";
export const HSMP_LEGACY_SCHEMA_VERSIONS = ["0", "0.1", "0.9", "legacy", "v0"];

// ── Top-level HSMP shape ────────────────────────────────────────────────────
export const HSMP_JSON_SCHEMA = {
  type: "object",
  required: ["objective", "milestones", "state_mutations", "summary_template", "summary_checklist"],
  properties: {
    schema_version: { type: "string", const: HSMP_SCHEMA_VERSION },
    producer: {
      type: "object",
      description: "Runtime-stamped prompt/model provenance. Runtime values are authoritative over model-provided values.",
      properties: {
        creative_prompt_version: { type: "string" },
        interpreter_prompt_version: { type: "string" },
        model_lane: { type: "string" },
      },
    },
    objective: { type: "string", minLength: 5, maxLength: 200,
      description: "One sentence confirming the requested operation." },
    milestones: {
      type: "array", minItems: 1, maxItems: 10,
      items: {
        type: "object",
        required: ["id", "text", "state"],
        properties: {
          id:    { type: "string", pattern: "^ms-[a-z0-9-]+$" },
          text:  { type: "string", minLength: 3, maxLength: 120 },
          state: { type: "string", enum: ["planned", "in_progress", "complete", "failed", "skipped"] },
        },
      },
    },
    state_mutations: {
      type: "array", maxItems: 50,
      items: {
        type: "object",
        required: ["id", "milestone_id", "kind", "target"],
        properties: {
          id:           { type: "string", pattern: "^sm-[a-z0-9-]+$" },
          milestone_id: { type: "string" },
          kind:         { type: "string", enum: [
            "file_create", "file_edit", "file_delete",
            "node_create", "node_edit", "node_delete",
            "wire_create", "wire_delete",
            "region_create", "region_resize",
            "component_update",
            "run_cmd", "test_run", "deploy",
            "annotation_add", "annotation_remove",
            "needs_more_context",
          ] },
          target:       { type: "string", minLength: 1 },
          primitive_version: { type: "string" },
          expected_workspace_version: { type: "integer", minimum: 1 },
          tab_id: { type: "string" },
          details:      { type: "object" },
          estimated_duration_ms: { type: "integer", minimum: 0, maximum: 600000 },
        },
      },
    },
    summary_template: { type: "string", maxLength: 300 },
    summary_checklist: {
      type: "array", minItems: 0, maxItems: 12,
      items: { type: "string", minLength: 3, maxLength: 200 },
    },
  },
};

// ── Element type definitions (per Doctrine §4.1) ────────────────────────────
export const ELEMENT_TYPES = {
  file:        { shape: "rounded_rect",  size: "medium", color_default: "warm_cream" },
  function:    { shape: "rounded_rect",  size: "small",  color_default: "soft_amber" },
  component:   { shape: "rounded_rect",  size: "large",  color_default: "cyan_warm", supports_preview: true },
  service:     { shape: "hexagon",       size: "medium", color_default: "orange" },
  route:       { shape: "pill",          size: "small",  color_default: "muted_taupe" },
  data_store:  { shape: "cylinder",      size: "medium", color_default: "wheat" },
  external_dep:{ shape: "diamond",       size: "small",  color_default: "text_muted" },
  test:        { shape: "triangle",      size: "small",  color_default: "warm_green" },
  config:      { shape: "gear_card",     size: "small",  color_default: "text_dim" },
  region:      { shape: "translucent_box", size: "auto", color_default: "translucent_warm" },
  annotation:  { shape: "floating_label", size: "tiny",  color_default: "text_soft" },
};

// ── Wire types (per Doctrine §4.2) ──────────────────────────────────────────
export const WIRE_TYPES = {
  function_call:  { style: "solid",       color: "orange",       arrowhead: true,   meaning: "A calls B" },
  data_flow:      { style: "dashed",      color: "cyan_warm",    arrowhead: true,   meaning: "A produces, B consumes" },
  dependency:     { style: "dotted",      color: "text_muted",   arrowhead: true,   meaning: "import / dep" },
  active_data:    { style: "solid",       color: "amber_pulse",  arrowhead: true,   meaning: "live data movement (animated)" },
  error_fallback: { style: "barbed",      color: "burnt_orange", arrowhead: true,   meaning: "error / fallback path" },
};

// ── Transition primitives (per Doctrine §4.3) ───────────────────────────────
export const TRANSITION_PRIMITIVES = {
  node_create:           { duration_ms: 220, curve: "ease_out_cubic" },
  node_edit_pulse:       { duration_ms: 600, curve: "sin", repeats: 3 },
  node_delete:           { duration_ms: 180, curve: "ease_in" },
  wire_draw:             { duration_ms: 350, curve: "ease_in_out" },
  wire_particle_flow:    { duration_ms: 500, curve: "linear", continuous: true },
  region_resize:         { duration_ms: 300, curve: "ease_out_spring" },
  selection_halo:        { duration_ms: 833, curve: "sin", continuous: true },
  milestone_beam:        { duration_ms: 480, curve: "ease_out" },
  camera_pan_zoom:       { duration_ms: 250, curve: "ease_out_cubic" },
  state_diff_swap:       { duration_ms: 220, curve: "linear", crossfade: true },
};

// Honor prefers-reduced-motion (operator setting)
export function applyReducedMotion(prefs) {
  if (!prefs?.prefers_reduced_motion) return TRANSITION_PRIMITIVES;
  const out = {};
  for (const [k, v] of Object.entries(TRANSITION_PRIMITIVES)) {
    out[k] = { ...v, duration_ms: Math.min(80, v.duration_ms), continuous: false, repeats: 1 };
  }
  return out;
}

export function normalizeHSMPVersion(hsmp) {
  if (!hsmp || typeof hsmp !== "object") {
    return {
      hsmp,
      migration: {
        supported: false,
        applied: false,
        from: null,
        to: HSMP_SCHEMA_VERSION,
        reason: "not-object",
      },
    };
  }
  const original = hsmp.schema_version ?? null;
  const originalString = original == null ? null : String(original);
  if (originalString === HSMP_SCHEMA_VERSION) {
    return {
      hsmp: { ...hsmp, schema_version: HSMP_SCHEMA_VERSION },
      migration: {
        supported: true,
        applied: false,
        from: HSMP_SCHEMA_VERSION,
        to: HSMP_SCHEMA_VERSION,
        reason: "already-current",
      },
    };
  }
  if (originalString == null || HSMP_LEGACY_SCHEMA_VERSIONS.includes(originalString)) {
    return {
      hsmp: { ...hsmp, schema_version: HSMP_SCHEMA_VERSION },
      migration: {
        supported: true,
        applied: true,
        from: originalString || "implicit-v0",
        to: HSMP_SCHEMA_VERSION,
        reason: originalString ? "legacy-version-upgrade" : "missing-version-upgrade",
      },
    };
  }
  return {
    hsmp: { ...hsmp },
    migration: {
      supported: false,
      applied: false,
      from: originalString,
      to: HSMP_SCHEMA_VERSION,
      reason: "unsupported-future-or-foreign-version",
    },
  };
}

// ── Validation ──────────────────────────────────────────────────────────────
/**
 * Validate an HSMP against the schema. Returns { valid, errors }.
 * Lightweight checker (no external Ajv) — covers the practical fail modes.
 */
export function validateHSMP(hsmp) {
  const errors = [];
  if (!hsmp || typeof hsmp !== "object") {
    errors.push({ path: "$", reason: "not an object" });
    return { valid: false, errors };
  }
  // schema_version (optional, but if present must match)
  if (hsmp.schema_version && hsmp.schema_version !== HSMP_SCHEMA_VERSION) {
    errors.push({ path: "$.schema_version", reason: `expected ${HSMP_SCHEMA_VERSION}, got ${hsmp.schema_version}` });
  }
  // objective
  if (typeof hsmp.objective !== "string" || hsmp.objective.length < 5 || hsmp.objective.length > 200) {
    errors.push({ path: "$.objective", reason: "missing or out-of-range (5-200 chars)" });
  }
  // milestones
  if (!Array.isArray(hsmp.milestones) || hsmp.milestones.length < 1 || hsmp.milestones.length > 10) {
    errors.push({ path: "$.milestones", reason: "must be array of 1-10 items" });
  } else {
    for (let i = 0; i < hsmp.milestones.length; i++) {
      const m = hsmp.milestones[i];
      if (!m || typeof m !== "object") { errors.push({ path: `$.milestones[${i}]`, reason: "not object" }); continue; }
      if (!/^ms-[a-z0-9-]+$/.test(m.id || "")) errors.push({ path: `$.milestones[${i}].id`, reason: "must match ^ms-[a-z0-9-]+$" });
      if (typeof m.text !== "string" || m.text.length < 3) errors.push({ path: `$.milestones[${i}].text`, reason: "missing or too short" });
      if (!["planned","in_progress","complete","failed","skipped"].includes(m.state)) errors.push({ path: `$.milestones[${i}].state`, reason: "invalid state enum" });
    }
  }
  // state_mutations
  if (!Array.isArray(hsmp.state_mutations)) {
    errors.push({ path: "$.state_mutations", reason: "must be array (may be empty)" });
  } else if (hsmp.state_mutations.length > 50) {
    errors.push({ path: "$.state_mutations", reason: "max 50 mutations per run" });
  } else {
    const validKinds = HSMP_JSON_SCHEMA.properties.state_mutations.items.properties.kind.enum;
    const msIds = new Set((hsmp.milestones || []).map(m => m?.id));
    for (let i = 0; i < hsmp.state_mutations.length; i++) {
      const sm = hsmp.state_mutations[i];
      if (!sm || typeof sm !== "object") { errors.push({ path: `$.state_mutations[${i}]`, reason: "not object" }); continue; }
      if (!/^sm-[a-z0-9-]+$/.test(sm.id || "")) errors.push({ path: `$.state_mutations[${i}].id`, reason: "must match ^sm-[a-z0-9-]+$" });
      if (!msIds.has(sm.milestone_id)) errors.push({ path: `$.state_mutations[${i}].milestone_id`, reason: `unknown milestone_id: ${sm.milestone_id}` });
      if (!validKinds.includes(sm.kind)) errors.push({ path: `$.state_mutations[${i}].kind`, reason: `invalid kind: ${sm.kind}` });
      if (typeof sm.target !== "string" || sm.target.length < 1) errors.push({ path: `$.state_mutations[${i}].target`, reason: "missing target" });
      if (sm.primitive_version !== undefined && typeof sm.primitive_version !== "string") errors.push({ path: `$.state_mutations[${i}].primitive_version`, reason: "must be string when present" });
      if (sm.expected_workspace_version !== undefined && (!Number.isInteger(sm.expected_workspace_version) || sm.expected_workspace_version < 1)) errors.push({ path: `$.state_mutations[${i}].expected_workspace_version`, reason: "must be integer >= 1 when present" });
      if (sm.tab_id !== undefined && typeof sm.tab_id !== "string") errors.push({ path: `$.state_mutations[${i}].tab_id`, reason: "must be string when present" });
    }
  }
  // summary_template
  if (typeof hsmp.summary_template !== "string") errors.push({ path: "$.summary_template", reason: "must be string" });
  // summary_checklist
  if (!Array.isArray(hsmp.summary_checklist) || hsmp.summary_checklist.length > 12) {
    errors.push({ path: "$.summary_checklist", reason: "must be array of 0-12 items" });
  }
  return { valid: errors.length === 0, errors };
}

// ── Helper: extract HSMP from raw model output (handles markdown fences) ────
export function stampHSMPProvenance(hsmp, producer = {}) {
  if (!hsmp || typeof hsmp !== "object") return hsmp;
  const normalized = normalizeHSMPVersion(hsmp);
  const normalizedHsmp = normalized.hsmp;
  const stateMutations = Array.isArray(normalizedHsmp.state_mutations)
    ? normalizedHsmp.state_mutations.map((sm) => ({
        ...sm,
        primitive_version: sm?.primitive_version || HSMP_PRIMITIVE_VERSION,
      }))
    : normalizedHsmp.state_mutations;
  return {
    ...normalizedHsmp,
    schema_version: normalized.migration.supported ? HSMP_SCHEMA_VERSION : normalizedHsmp.schema_version,
    hsmp_compat_version: HSMP_COMPAT_VERSION,
    primitive_version: HSMP_PRIMITIVE_VERSION,
    state_mutations: stateMutations,
    producer: {
      ...(normalizedHsmp.producer && typeof normalizedHsmp.producer === "object" ? normalizedHsmp.producer : {}),
      ...producer,
    },
    compatibility: {
      ...(normalizedHsmp.compatibility && typeof normalizedHsmp.compatibility === "object" ? normalizedHsmp.compatibility : {}),
      min_compiler_version: "6.3.0-alpha.7",
      migration_required: !normalized.migration.supported,
      schema_migration: normalized.migration,
    },
  };
}

export function extractHSMP(raw) {
  if (!raw || typeof raw !== "string") return { hsmp: null, error: "empty input" };
  // Try to find a JSON object in the text
  // 1. Look for ```json … ``` fence
  const fenceMatch = raw.match(/```json\s*\n?([\s\S]*?)\n?```/);
  let jsonText = fenceMatch?.[1] || null;
  // 2. If no fence, try first { … last }
  if (!jsonText) {
    const firstBrace = raw.indexOf("{");
    const lastBrace = raw.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      jsonText = raw.slice(firstBrace, lastBrace + 1);
    }
  }
  if (!jsonText) return { hsmp: null, error: "no JSON object found in raw output" };
  try {
    const parsed = JSON.parse(jsonText);
    return { hsmp: parsed, error: null };
  } catch (e) {
    return { hsmp: null, error: `JSON parse failed: ${e.message}` };
  }
}
