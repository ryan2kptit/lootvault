import { type CanActivate, type ExecutionContext, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";

import { AppError } from "../errors/app-error";
import type { AuthUser } from "./auth.types";

type AuthedRequest = Request & { user?: AuthUser };

/** The token after a (case-insensitive) bearer scheme: undefined without the scheme, "" when the token is empty. */
function bearerToken(req: Request): string | undefined {
  return /^bearer\s+(.*)$/i.exec(req.headers.authorization ?? "")?.[1];
}

/** The user a token proves, or undefined when it is malformed, badly signed or expired. */
function verifiedUser(jwt: JwtService, token: string): AuthUser | undefined {
  try {
    const payload = jwt.verify<{ sub: string }>(token);
    return { address: payload.sub.toLowerCase() as AuthUser["address"] };
  } catch {
    return undefined;
  }
}

/** Requires a valid `Authorization: Bearer <jwt>`; sets `req.user`. */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const token = bearerToken(req);
    if (token === undefined) throw new AppError("UNAUTHORIZED", 401, "Missing bearer token");
    const user = verifiedUser(this.jwt, token);
    if (!user) throw new AppError("UNAUTHORIZED", 401, "Invalid or expired token");
    req.user = user;
    return true;
  }
}

/**
 * Like JwtAuthGuard, but for public routes: a missing, malformed, invalid or expired token means
 * "no user" and the request continues (`req.user` stays undefined). A stale token left in a browser
 * must not break pages that work without logging in.
 */
@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const token = bearerToken(req);
    if (token !== undefined) req.user = verifiedUser(this.jwt, token);
    return true;
  }
}
