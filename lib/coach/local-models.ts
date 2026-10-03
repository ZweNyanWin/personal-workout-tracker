/** Bounded local-inspection choices; no model installation or live-model promotion. */
const ORIGINAL = "workout-coach";
const MODEL_NAME = /^workout-coach(?:-v[1-9]\d{0,3})?(?::latest)?$/;
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);
const MAX_TAGS = 512;
const MAX_CHOICES = 64;

export type LocalCoachModel = {
  name: string;
  model: string;
  size: number;
  label: string;
  experimental: true;
};

export function coachModelName(value: unknown): string | null {
  return typeof value === "string" && value.length <= 40 && MODEL_NAME.test(value)
    ? value.replace(/:latest$/, "") : null;
}

export function installedCoachModels(value: unknown): LocalCoachModel[] {
  if (!value || typeof value !== "object" || !Array.isArray((value as { models?: unknown }).models)) return [];
  const tags = (value as { models: unknown[] }).models;
  const seen = new Map<string, LocalCoachModel>();
  for (const entry of tags.slice(0, MAX_TAGS)) {
    if (!entry || typeof entry !== "object") continue;
    const tag = entry as { name?: unknown; size?: unknown };
    const model = coachModelName(tag.name);
    if (!model || seen.has(model)) continue;
    const size = typeof tag.size === "number" && Number.isSafeInteger(tag.size) && tag.size >= 0 && tag.size <= 1024 ** 4 ? tag.size : 0;
    seen.set(model, { name: `${model}:latest`, model, size,
      label: model === ORIGINAL ? "Original Tommy · unvalidated" : `Candidate v${model.slice("workout-coach-v".length)} · experimental / unvalidated`,
      experimental: true });
  }
  return [...seen.values()].sort((a, b) => a.model === ORIGINAL ? -1 : b.model === ORIGINAL ? 1
    : Number(a.model.slice("workout-coach-v".length)) - Number(b.model.slice("workout-coach-v".length))).slice(0, MAX_CHOICES);
}

export function selectInstalledCoachModel(requested: unknown, tags: unknown): string | null {
  const model = coachModelName(requested);
  return model && installedCoachModels(tags).some(entry => entry.model === model) ? model : null;
}

export function localInspectionAllowed(environment: string | undefined, requestUrl: string, host: string | null): boolean {
  if (environment !== "development" || !host || !/^(?:127\.0\.0\.1|localhost|\[::1\])(?::\d{1,5})?$/.test(host)) return false;
  try {
    const url = new URL(requestUrl);
    const suppliedHost = new URL(`${url.protocol}//${host}`);
    // Next dev may normalize the URL to its bind hostname. Both authorities must
    // remain loopback on the same port; POST still checks the raw Host's origin.
    return ["http:", "https:"].includes(url.protocol) && LOOPBACK.has(url.hostname) && !url.username && !url.password
      && LOOPBACK.has(suppliedHost.hostname) && url.port === suppliedHost.port;
  } catch { return false; }
}

export function localInspectionOriginAllowed(environment: string | undefined, requestUrl: string, host: string | null, origin: string | null): boolean {
  return localInspectionAllowed(environment, requestUrl, host)
    && origin === new URL(`${new URL(requestUrl).protocol}//${host}`).origin;
}
