import type { Session } from "../api";

/** A session is live until its expiry. */
export const isLive = (session: Session | null, now = Date.now()): session is Session =>
  session !== null && Date.parse(session.expiresAt) > now;

/** The bearer token to send: only a live session, and only while the wallet it was issued to is the connected one. */
export function tokenFor(session: Session | null, connectedAddress: string | undefined, now = Date.now()): string | undefined {
  if (!isLive(session, now) || connectedAddress === undefined) return undefined;
  return session.address === connectedAddress.toLowerCase() ? session.accessToken : undefined;
}
