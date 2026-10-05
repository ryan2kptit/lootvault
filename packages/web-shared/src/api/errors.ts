/** A failed backend call. `message` is ready to show to the user; `code` and `details` come from the error envelope. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** Builds an ApiError from a `{ error: { code, message, details } }` body, or from whatever a proxy returned. */
  static fromResponse(status: number, body: unknown): ApiError {
    const envelope = isErrorEnvelope(body) ? body.error : undefined;
    const code = envelope?.code ?? (status === 401 ? "UNAUTHORIZED" : "HTTP_ERROR");
    return new ApiError(status, code, readableMessage(code, envelope?.details, envelope?.message), envelope?.details);
  }

  static network(): ApiError {
    return new ApiError(0, "NETWORK_ERROR", readableMessage("NETWORK_ERROR", undefined, undefined));
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  /** A field of `details`, e.g. `available` and `itemId` of INSUFFICIENT_STOCK. */
  detail(key: string): unknown {
    return detailOf(this.details, key);
  }
}

/** True for an ApiError, optionally with a given code: `isApiError(error, "STORE_NOT_FOUND")`. */
export function isApiError(error: unknown, code?: string): error is ApiError {
  return error instanceof ApiError && (code === undefined || error.code === code);
}

const MESSAGES: Record<string, (details: unknown) => string> = {
  INSUFFICIENT_STOCK: (details) => {
    const available = detailOf(details, "available");
    if (available === 0) return "Sold out: no copies are left.";
    return `Only ${typeof available === "number" ? available : "a few"} left. Lower the quantity and try again.`;
  },
  ITEM_UNAVAILABLE: () => "An item in your cart is no longer for sale.",
  MIXED_STORES: () => "A cart can only hold items from one store.",
  TOO_MANY_PENDING_ORDERS: (details) => {
    const max = detailOf(details, "max");
    return `You already have ${typeof max === "number" ? max : "too many"} open checkouts. Finish one or wait for it to expire.`;
  },
  CATALOG_UNAVAILABLE: () => "The catalog is temporarily unavailable. Please try again in a moment.",
  CART_INVALID: () => "A cart holds 1-10 different items, with 1-10 copies of each.",
  SUPPLY_LOCKED: () => "Supply is locked: the edition size was fixed on-chain at the first sale.",
  IMAGE_NOT_HOSTED: () => "Upload the image through LootVault before saving.",
  TX_INVALID: () => "The transaction did not succeed on-chain.",
  TX_MISMATCH: () => "This transaction does not pay for this order.",
  SLUG_TAKEN: () => "That store URL is already taken. Choose another slug.",
  STORE_EXISTS: () => "This wallet already owns a store.",
  STORE_NOT_FOUND: () => "Store not found.",
  ITEM_NOT_FOUND: () => "Item not found.",
  ORDER_NOT_FOUND: () => "Order not found.",
  FORBIDDEN: () => "You do not have access to this.",
  UNAUTHORIZED: () => "Your session has expired. Please sign in again.",
  NONCE_INVALID: () => "The sign-in request expired. Please sign in again.",
  SIWE_DOMAIN_NOT_ALLOWED: () => "Sign-in is not allowed from this site.",
  SIWE_WRONG_CHAIN: () => "Your wallet is on the wrong network.",
  NETWORK_ERROR: () => "Cannot reach the server. Check your connection and try again.",
};

function readableMessage(code: string, details: unknown, serverMessage: string | undefined): string {
  const describe = MESSAGES[code];
  if (describe) return describe(details);
  if (code === "VALIDATION_FAILED" && Array.isArray(details)) return `${details.join(". ")}.`;
  return serverMessage ?? "Something went wrong. Please try again.";
}

function isErrorEnvelope(body: unknown): body is { error: { code: string; message?: string; details?: unknown } } {
  if (typeof body !== "object" || body === null || !("error" in body)) return false;
  const { error } = body;
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string";
}

function detailOf(details: unknown, key: string): unknown {
  return typeof details === "object" && details !== null && key in details ? (details as Record<string, unknown>)[key] : undefined;
}
