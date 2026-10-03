import { createParamDecorator, type ExecutionContext } from "@nestjs/common";

import type { AuthUser } from "./auth.types";

/** The caller set by JwtAuthGuard / OptionalJwtAuthGuard (undefined when anonymous). */
export const CurrentUser = createParamDecorator(
  (_: unknown, context: ExecutionContext): AuthUser | undefined => context.switchToHttp().getRequest().user,
);
