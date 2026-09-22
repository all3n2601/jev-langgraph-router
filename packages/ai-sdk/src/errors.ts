export class JevAdapterConfigurationError extends Error {
  override readonly name = "JevAdapterConfigurationError";
}

export class JevInvalidResponseError extends Error {
  override readonly name = "JevInvalidResponseError";
}

export class JevTimeoutError extends Error {
  override readonly name = "JevTimeoutError";

  constructor(readonly timeoutMs: number) {
    super(`Jev evaluation exceeded the ${timeoutMs}ms timeout`);
  }
}
