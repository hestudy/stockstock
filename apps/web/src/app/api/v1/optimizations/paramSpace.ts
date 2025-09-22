export type ParamSpace = Record<string, unknown>;

export type NormalizedParamSpace = Record<string, unknown[]>;

type Dimension = {
  key: string;
  values: unknown[];
};

export type ParamSpaceSummary = {
  normalized: NormalizedParamSpace;
  estimate: number;
  dimensions: Dimension[];
};

const RANGE_KEYS = new Set(["start", "end", "step"]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeDimension(key: string, raw: unknown): Dimension {
  if (Array.isArray(raw)) {
    const values = raw.filter((x) => x !== undefined && x !== null);
    if (values.length === 0) {
      throwParamError(`paramSpace.${key} requires at least one value`);
    }
    return { key, values };
  }

  if (isPlainObject(raw) && hasRangeShape(raw)) {
    return { key, values: expandRange(key, raw) };
  }

  if (
    typeof raw === "number" ||
    typeof raw === "string" ||
    typeof raw === "boolean"
  ) {
    return { key, values: [raw] };
  }

  throwParamError(`paramSpace.${key} is unsupported`);
}

function hasRangeShape(raw: Record<string, unknown>): boolean {
  return [...RANGE_KEYS].every((k) => k in raw);
}

function expandRange(key: string, raw: Record<string, unknown>): unknown[] {
  const start = raw.start;
  const end = raw.end;
  const step = raw.step;
  if (typeof start !== "number" || typeof end !== "number" || typeof step !== "number") {
    throwParamError(`paramSpace.${key} range requires numeric start/end/step`);
  }
  if (step <= 0) {
    throwParamError(`paramSpace.${key} step must be > 0`);
  }
  const values: number[] = [];
  const ascending = end >= start;
  let current = start;
  const guard = 1_000_000; // prevent infinite loop
  let iterations = 0;
  while ((ascending ? current <= end : current >= end) && iterations < guard) {
    values.push(Number(current.toFixed(12)));
    current = ascending ? current + step : current - step;
    iterations++;
  }
  if (iterations >= guard) {
    throwParamError(`paramSpace.${key} range produced too many values`);
  }
  if (values.length === 0) {
    throwParamError(`paramSpace.${key} range produced no values`);
  }
  return values;
}

export function summarizeParamSpace(space: ParamSpace): ParamSpaceSummary {
  if (!space || typeof space !== "object" || Array.isArray(space)) {
    throwParamError("paramSpace must be an object");
  }
  const entries = Object.entries(space);
  if (entries.length === 0) {
    throwParamError("paramSpace requires at least one dimension");
  }
  const dimensions = entries.map(([key, raw]) => normalizeDimension(key, raw));
  let estimate = 1;
  for (const dim of dimensions) {
    estimate = safeMultiply(estimate, dim.values.length);
  }
  return {
    dimensions,
    estimate,
    normalized: Object.fromEntries(dimensions.map((d) => [d.key, d.values])),
  };
}

function safeMultiply(current: number, factor: number): number {
  const limit = getParamSpaceLimit();
  if (!Number.isFinite(factor) || factor <= 0) {
    throwParamError("paramSpace dimension size must be positive", {
      factor,
    });
  }
  const product = current * factor;
  if (product > limit * 4) {
    throwParamError("param space exceeds safe processing window", {
      estimate: product,
      limit,
    });
  }
  return product;
}

function throwParamError(message: string, details?: Record<string, unknown>): never {
  const err = new Error(message);
  (err as any).code = "E.PARAM_INVALID";
  (err as any).status = 400;
  if (details) {
    (err as any).details = details;
  }
  throw err;
}

export function getParamSpaceLimit(): number {
  const raw = process.env.OPT_PARAM_SPACE_MAX;
  if (!raw) return 500;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 500;
  }
  return Math.floor(parsed);
}
