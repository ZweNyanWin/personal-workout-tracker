/** Bound SDK calls too: cancelling fetch alone may leave an SDK retry loop running. */
export async function withDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  parentSignal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  const signal = controller.signal;
  const cancel = () => controller.abort(parentSignal?.reason ?? new DOMException("Request cancelled", "AbortError"));
  if (parentSignal?.aborted) cancel();
  if (signal.aborted) throw signal.reason;
  // Listener composition also works on iPhones that lack AbortSignal.any.
  parentSignal?.addEventListener("abort", cancel, { once: true });
  let onAbort: () => void = () => {};
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
  });
  const timer = setTimeout(() => controller.abort(new DOMException("Request timed out", "TimeoutError")), timeoutMs);
  try {
    return await Promise.race([operation(signal), aborted]);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", onAbort);
    parentSignal?.removeEventListener("abort", cancel);
  }
}
