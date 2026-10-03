import { type DynamicModule, Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";

import { APP_CONFIG } from "../config/env";
import type { AuthConfig } from "./auth.types";
import { InternalKeyGuard } from "./internal-key.guard";
import { JwtAuthGuard, OptionalJwtAuthGuard } from "./jwt-auth.guard";

/** Global JWT verification (and signing, for auth-svc) plus the auth guards. Needs AppConfigModule. */
@Module({})
export class CommonAuthModule {
  static forRoot(): DynamicModule {
    return {
      module: CommonAuthModule,
      global: true,
      imports: [
        JwtModule.registerAsync({
          inject: [APP_CONFIG],
          useFactory: (config: AuthConfig) => ({
            secret: config.JWT_SECRET,
            signOptions: { expiresIn: config.JWT_TTL_SECONDS ?? 7200 },
          }),
        }),
      ],
      providers: [JwtAuthGuard, OptionalJwtAuthGuard, InternalKeyGuard],
      exports: [JwtModule, JwtAuthGuard, OptionalJwtAuthGuard, InternalKeyGuard],
    };
  }
}
