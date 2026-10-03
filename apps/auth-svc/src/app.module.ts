import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { APP_CONFIG, AppConfigModule, CommonAuthModule, createLoggerModule } from "@lootvault/nest-common";

import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { authConfigSchema, type AuthSvcConfig } from "./config";
import { Nonce, NonceSchema } from "./nonce.schema";
import { User, UserSchema } from "./user.schema";

@Module({
  imports: [
    AppConfigModule.forRoot(authConfigSchema),
    createLoggerModule("auth-svc"),
    CommonAuthModule.forRoot(),
    MongooseModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AuthSvcConfig) => ({ uri: config.MONGO_URL, dbName: config.AUTH_DB }),
    }),
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Nonce.name, schema: NonceSchema },
    ]),
  ],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AppModule {}
