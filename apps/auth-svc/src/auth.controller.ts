import { Body, Controller, Get, HttpCode, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { type AuthUser, CurrentUser, JwtAuthGuard } from "@lootvault/nest-common";

import { NonceQueryDto, VerifyDto } from "./auth.dto";
import { AuthService } from "./auth.service";

@ApiTags("auth")
@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Get("nonce")
  nonce(@Query() query: NonceQueryDto) {
    return this.auth.issueNonce(query.address);
  }

  @Post("verify")
  @HttpCode(200)
  verify(@Body() body: VerifyDto) {
    return this.auth.verify(body.message, body.signature);
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.address);
  }

  @Get("health")
  health() {
    return { status: "ok" };
  }
}
