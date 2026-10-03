import type { Address, Hex } from "viem";

import type { HttpClient } from "./http";
import type { Session } from "./types";

/** auth-svc (`/auth`): Sign-In with Ethereum. */
export function authApi(http: HttpClient) {
  return {
    nonce: (address: Address) => http<{ nonce: string; expiresAt: string }>("auth", "/nonce", { query: { address } }),
    verify: (message: string, signature: Hex) => http<Session>("auth", "/verify", { method: "POST", body: { message, signature } }),
  };
}
