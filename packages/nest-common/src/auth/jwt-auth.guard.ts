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

function verify(jwt: JwtService, token: string): AuthUser {
  try {
    const payload = jwt.verify<{ sub: string }>(token);
    return { address: payload.sub.toLowerCase() as AuthUser["address"] };
  } catch {
    throw new AppError("UNAUTHORIZED", 401, "Invalid or expired token");
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
    req.user = verify(this.jwt, token);
    return true;
  }
}

/** Like JwtAuthGuard, but anonymous requests pass (`req.user` stays undefined). */
@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const token = bearerToken(req);
    if (token !== undefined) req.user = verify(this.jwt, token);
    return true;
  }
}
