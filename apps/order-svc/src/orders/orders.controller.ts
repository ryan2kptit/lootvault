import { Body, Controller, Get, HttpCode, Param, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { type AuthUser, CurrentUser, JwtAuthGuard } from "@lootvault/nest-common";
import type { Request, Response } from "express";

import { CheckoutDto, ConfirmDto, RecentSalesQueryDto, SalesQueryDto } from "./orders.dto";
import { OrdersService } from "./orders.service";

const requestId = (req: Request) => (req as Request & { id?: string }).id;

@ApiTags("orders")
@Controller()
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get("health")
  health() {
    return { status: "ok" };
  }

  @Post("checkout")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  checkout(@CurrentUser() user: AuthUser, @Body() body: CheckoutDto, @Req() req: Request) {
    return this.orders.checkout(user.address, body.lines, requestId(req));
  }

  // Static routes are declared before ":id".
  @Get("me")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  mine(@CurrentUser() user: AuthUser, @Query() query: SalesQueryDto) {
    return this.orders.listForBuyer(user.address, query);
  }

  @Get("store/me")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  sales(@CurrentUser() user: AuthUser, @Query() query: SalesQueryDto) {
    return this.orders.listForSeller(user.address, query);
  }

  @Get("store/me/stats")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  stats(@CurrentUser() user: AuthUser) {
    return this.orders.stats(user.address);
  }

  @Get("recent-sales")
  recentSales(@Query() query: RecentSalesQueryDto) {
    return this.orders.recentSales(query);
  }

  @Get(":id")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.orders.get(id, user.address);
  }

  /** 200 with the PAID order, or 202 { status: "PENDING_TX" } when the tx is not mined yet (poll GET /orders/:id). */
  @Post(":id/confirm")
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async confirm(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: ConfirmDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.orders.confirm(id, user.address, body.txHash, requestId(req));
    if (result.status === "PENDING_TX") res.status(202);
    return result;
  }
}
