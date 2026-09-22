import { JevTimeoutError } from "./errors.js";

function abortReason(signal: AbortSignal): unknown {
  return signal.reason;
}

export async function withDeadline<T>(
  run: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  parentSignal?: AbortSignal,
): Promise<T> {
  if (parentSignal?.aborted) {
    throw abortReason(parentSignal);
  }

  const controller = new AbortController();
  let rejectDeadline!: (reason: unknown) => void;

  const deadline = new Promise<never>((_resolve, reject) => {
    rejectDeadline = reject;
  });

  const onParentAbort = () => {
    const reason = abortReason(parentSignal as AbortSignal);
    controller.abort(reason);
    rejectDeadline(reason);
  };

  parentSignal?.addEventListener("abort", onParentAbort, { once: true });

  const timeout = setTimeout(() => {
    const error = new JevTimeoutError(timeoutMs);
    controller.abort(error);
    rejectDeadline(error);
  }, timeoutMs);

  try {
    return await Promise.race([run(controller.signal), deadline]);
  } finally {
    clearTimeout(timeout);
    parentSignal?.removeEventListener("abort", onParentAbort);
  }
}
