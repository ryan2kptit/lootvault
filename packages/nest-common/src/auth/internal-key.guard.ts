import { timingSafeEqual } from "node:crypto";

import { type CanActivate, type ExecutionContext, Injectable } from "@nestjs/common";
import type { Request } from "express";

import { InjectConfig } from "../config/env";
import { AppError } from "../errors/app-error";
import type { AuthConfig } from "./auth.types";

/** Service-to-service guard: `x-internal-key` must equal INTERNAL_API_KEY (constant-time compare). */
@Injectable()
export class InternalKeyGuard implements CanActivate {
  constructor(@InjectConfig() private readonly config: AuthConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.INTERNAL_API_KEY;
    const provided = context.switchToHttp().getRequest<Request>().headers["x-internal-key"];
    if (!expected || typeof provided !== "string") throw new AppError("UNAUTHORIZED", 401, "Missing internal key");
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new AppError("UNAUTHORIZED", 401, "Invalid internal key");
    return true;
  }
}
