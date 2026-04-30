const DEFAULT_GEMINI_MODEL = "gemini-2.0-flash";
const TRANSIENT_STATUSES = new Set([429, 500, 502, 503, 504]);

interface GeminiRunContext {
  route: string;
  operation: string;
}

function getErrorStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const status = (error as { status?: unknown; statusCode?: unknown }).status ?? (error as { statusCode?: unknown }).statusCode;
  return typeof status === "number" ? status : undefined;
}

export function isTransientGeminiError(error: unknown): boolean {
  const status = getErrorStatus(error);
  if (status && TRANSIENT_STATUSES.has(status)) return true;

  const message = error instanceof Error ? error.message : String(error);
  return /high demand|service unavailable|overloaded|temporarily unavailable|try again later|rate limit/i.test(message);
}

// Daily quota exhaustion — retrying the same model after 250 ms is pointless.
function isQuotaExhausted(error: unknown): boolean {
  if (getErrorStatus(error) !== 429) return false;
  const message = error instanceof Error ? error.message : String(error);
  return /quota.*exceeded|free.?tier|exceeded.*quota/i.test(message);
}

export function getGeminiModelCandidates(): string[] {
  const primary = process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
  const fallbackEnv = process.env.GEMINI_FALLBACK_MODELS ?? process.env.GEMINI_FALLBACK_MODEL;
  const fallbacks = fallbackEnv
    ? fallbackEnv.split(",").map((model) => model.trim()).filter(Boolean)
    : [DEFAULT_GEMINI_MODEL];

  return Array.from(new Set([primary, ...fallbacks]));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runGeminiWithFallback<T>(
  operation: (modelName: string) => Promise<T>,
  context: GeminiRunContext,
): Promise<T> {
  const models = getGeminiModelCandidates();
  let lastError: unknown;

  for (const modelName of models) {
    const attempts = modelName === models[0] ? 2 : 1;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        return await operation(modelName);
      } catch (error) {
        lastError = error;
        if (!isTransientGeminiError(error)) throw error;

        console.warn("[gemini] transient failure", {
          route: context.route,
          operation: context.operation,
          model: modelName,
          attempt,
          status: getErrorStatus(error),
          message: error instanceof Error ? error.message : String(error),
        });

        // Daily quota exhaustion: retrying the same model immediately is
        // pointless — break to try the next model candidate instead.
        if (isQuotaExhausted(error)) break;

        if (attempt < attempts) {
          await delay(250 * attempt);
        }
      }
    }
  }

  throw lastError;
}
