import { type CanActivate, type ExecutionContext, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";

import { AppError } from "../errors/app-error";
import type { AuthUser } from "./auth.types";

type AuthedRequest = Request & { user?: AuthUser };

function bearerToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  return header?.startsWith("Bearer ") ? header.slice(7) : undefined;
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
    if (!token) throw new AppError("UNAUTHORIZED", 401, "Missing bearer token");
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
    if (token) req.user = verify(this.jwt, token);
    return true;
  }
}
