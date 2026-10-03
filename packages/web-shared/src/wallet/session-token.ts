import type { Session } from "../api";

/** A session is live until its expiry. */
export const isLive = (session: Session | null, now = Date.now()): session is Session =>
  session !== null && Date.parse(session.expiresAt) > now;

/** The bearer token to send: only a live session, and only while the wallet it was issued to is the connected one. */
export function tokenFor(session: Session | null, connectedAddress: string | undefined, now = Date.now()): string | undefined {
  if (!isLive(session, now) || connectedAddress === undefined) return undefined;
  return session.address === connectedAddress.toLowerCase() ? session.accessToken : undefined;
}

/** The longest delay `setTimeout` accepts; a larger one fires immediately. */
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

/** Milliseconds until the session expires, for a sign-out timer: 0 when it is missing, expired or has an invalid date. */
export function msUntilExpiry(session: Session | null, now = Date.now()): number {
  const remaining = session === null ? 0 : Date.parse(session.expiresAt) - now;
  return Number.isNaN(remaining) ? 0 : Math.min(Math.max(remaining, 0), MAX_TIMEOUT_MS);
}
