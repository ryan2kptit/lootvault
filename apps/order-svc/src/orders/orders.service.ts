import { randomBytes } from "node:crypto";

import { Inject, Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { AppError, EVENT_PUBLISHER, type EventPublisher, InjectConfig, type Page, paginate } from "@lootvault/nest-common";
import { type CheckoutMessage, type CheckoutWire, checkoutToWire, EVENT_TYPES, type PurchasedEvent, toChainEvents } from "@lootvault/shared";
import { type FilterQuery, isValidObjectId, type Model, type PipelineStage, Types } from "mongoose";
import type { Hex } from "viem";

import { CATALOG_CLIENT, type CatalogClient } from "../catalog/catalog.client";
import { CHAIN_READER, type ChainReader } from "../chain/chain-reader";
import type { OrderConfig } from "../config";
import { assertCheckoutable, type CartLineInput, validateCart } from "../domain/cart-rules";
import { orderTotal, priceLines } from "../domain/pricing";
import { PurchasedHandler } from "../events/purchased.handler";
import { CheckoutSigner } from "./checkout-signer";
import { Order, type OrderDocument, type OrderView, toOrderView } from "./order.schema";
import type { RecentSalesQueryDto, SalesQueryDto } from "./orders.dto";

export interface CheckoutResult {
  order: OrderView;
  /** Everything the wallet needs to call LootVault1155.purchase(checkout, signature) with `value`. */
  purchase: { chainId: number; contract: `0x${string}`; checkout: CheckoutWire; signature: Hex; value: string };
}

export type ConfirmResult = { status: "PAID"; order: OrderView } | { status: "PENDING_TX" };

const orderNotFound = () => new AppError("ORDER_NOT_FOUND", 404, "Order not found");
const DAY_MS = 86_400_000;

@Injectable()
export class OrdersService implements OnModuleInit {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectModel(Order.name) private readonly orders: Model<Order>,
    @Inject(CATALOG_CLIENT) private readonly catalog: CatalogClient,
    @Inject(CHAIN_READER) private readonly chain: ChainReader,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
    private readonly signer: CheckoutSigner,
    private readonly purchased: PurchasedHandler,
    @InjectConfig() private readonly config: OrderConfig,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.orders.init();
  }

  async checkout(buyer: string, lines: CartLineInput[], requestId?: string): Promise<CheckoutResult> {
    validateCart(lines);
    await this.assertUnderPendingCap(buyer);
    const ids = lines.map((line) => line.itemId);
    const items = new Map((await this.catalog.getItems(ids, requestId)).map((item) => [item.id, item]));
    assertCheckoutable(lines, items, await this.pendingQuantities(ids));

    const priced = priceLines(lines, items);
    const total = orderTotal(priced);
    const seller = items.get(lines[0].itemId)!;
    const deadlineSeconds = Math.floor(Date.now() / 1000) + this.config.CHECKOUT_TTL_SECONDS;
    const orderId = `0x${randomBytes(32).toString("hex")}` as Hex;

    const order = await this.orders.create({
      orderId,
      buyer,
      storeId: seller.storeId,
      storeSlug: seller.storeSlug,
      sellerAddress: seller.ownerAddress,
      lines: priced.map((line) => ({
        itemId: line.itemId,
        tokenId: line.tokenId,
        name: line.name,
        imageUrl: line.imageUrl,
        quantity: line.quantity,
        unitPriceWei: Types.Decimal128.fromString(line.unitPriceWei.toString()),
      })),
      totalWei: Types.Decimal128.fromString(total.toString()),
      status: "PENDING",
      deadline: new Date(deadlineSeconds * 1000),
    });

    const message: CheckoutMessage = {
      orderId,
      buyer: buyer as `0x${string}`,
      deadline: BigInt(deadlineSeconds),
      lines: priced.map((line) => ({
        tokenId: BigInt(line.tokenId),
        creator: line.creator,
        quantity: BigInt(line.quantity),
        unitPrice: line.unitPriceWei,
        maxSupply: BigInt(line.maxSupply),
      })),
    };
    return {
      order: toOrderView(order),
      purchase: {
        chainId: this.config.CHAIN_ID,
        contract: this.config.CONTRACT_ADDRESS,
        checkout: checkoutToWire(message),
        signature: await this.signer.sign(message),
        value: total.toString(),
      },
    };
  }

  /**
   * Fast-path: the buyer reports its tx hash right after mining. We read the receipt ourselves
   * (never trusting the client), decode it exactly like the indexer, apply Purchased through the
   * same idempotent handler, and publish all decoded events so catalog updates within seconds.
   */
  async confirm(id: string, buyer: string, txHash: Hex, requestId?: string): Promise<ConfirmResult> {
    const order = await this.byId(id);
    if (order.buyer !== buyer) throw orderNotFound();
    if (order.status === "PAID") return { status: "PAID", order: toOrderView(order) };

    const receipt = await this.chain.getReceipt(txHash);
    if (!receipt) return { status: "PENDING_TX" };
    if (receipt.status !== "success" || receipt.to?.toLowerCase() !== this.config.CONTRACT_ADDRESS) {
      throw new AppError("TX_INVALID", 422, "Transaction did not succeed against the LootVault contract");
    }

    // Same finality rule as the indexer: until it is deep enough, answer like "not mined yet" and publish nothing.
    const head = await this.chain.getBlockNumber();
    if (head - receipt.blockNumber < BigInt(this.config.CONFIRMATIONS)) return { status: "PENDING_TX" };

    const blockTimestamp = await this.chain.getBlockTimestamp(receipt.blockNumber);
    const events = toChainEvents(receipt.logs, {
      chainId: this.config.CHAIN_ID,
      contract: this.config.CONTRACT_ADDRESS,
      blockTimestamp: () => blockTimestamp,
      correlationId: requestId,
    });
    const purchase = events.find(
      (event): event is PurchasedEvent =>
        event.type === EVENT_TYPES.Purchased && event.data.orderId === order.orderId && event.data.buyer === order.buyer,
    );
    if (!purchase || BigInt(purchase.data.total) !== BigInt(order.totalWei.toString())) {
      throw new AppError("TX_MISMATCH", 422, "Transaction does not pay for this order");
    }

    await this.purchased.handle(purchase);
    try {
      await this.publisher.publish(events);
    } catch (error) {
      // Not fatal: the indexer publishes the same events (same ids) on its next tick.
      this.logger.warn(`Fast-path publish failed for ${txHash}: ${(error as Error).message}`);
    }
    return { status: "PAID", order: toOrderView(await this.byId(id)) };
  }

  async get(id: string, viewer: string): Promise<OrderView> {
    const order = await this.byId(id);
    if (order.buyer !== viewer && order.sellerAddress !== viewer) throw orderNotFound();
    return toOrderView(order);
  }

  listForBuyer(buyer: string, query: SalesQueryDto): Promise<Page<OrderView>> {
    return this.list({ buyer, ...(query.status ? { status: query.status } : {}) }, query);
  }

  listForSeller(seller: string, query: SalesQueryDto): Promise<Page<OrderView>> {
    return this.list({ sellerAddress: seller, ...(query.status ? { status: query.status } : {}) }, query);
  }

  /** Seller dashboard: gross/fee/net revenue, counts and a 7-day series (UTC days). */
  async stats(seller: string, now = new Date()) {
    const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - 6 * DAY_MS);
    const [totals] = await this.orders.aggregate<{ gross: Types.Decimal128; fee: Types.Decimal128; orders: number; items: number }>([
      { $match: { sellerAddress: seller, status: "PAID" } },
      {
        $group: {
          _id: null,
          gross: { $sum: "$totalWei" },
          fee: { $sum: { $ifNull: ["$feeWei", Types.Decimal128.fromString("0")] } },
          orders: { $sum: 1 },
          items: { $sum: { $sum: "$lines.quantity" } },
        },
      },
    ]);
    const days = await this.orders.aggregate<{ _id: string; gross: Types.Decimal128; orders: number }>([
      { $match: { sellerAddress: seller, status: "PAID", paidAt: { $gte: since } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$paidAt" } }, gross: { $sum: "$totalWei" }, orders: { $sum: 1 } } },
    ]);
    const byDay = new Map(days.map((day) => [day._id, day]));
    const gross = BigInt(totals?.gross.toString() ?? "0");
    const fee = BigInt(totals?.fee.toString() ?? "0");
    return {
      grossWei: gross.toString(),
      feeWei: fee.toString(),
      netWei: (gross - fee).toString(),
      ordersPaid: totals?.orders ?? 0,
      itemsSold: totals?.items ?? 0,
      last7Days: Array.from({ length: 7 }, (_, i) => {
        const date = new Date(since.getTime() + i * DAY_MS).toISOString().slice(0, 10);
        const day = byDay.get(date);
        return { date, grossWei: day?.gross.toString() ?? "0", orders: day?.orders ?? 0 };
      }),
    };
  }

  /** Public "recent sales" for a store or an item (quantity = copies of that item, or of the whole order). */
  async recentSales(query: RecentSalesQueryDto) {
    if (!query.storeId && !query.itemId) throw new AppError("VALIDATION_FAILED", 400, "storeId or itemId is required");
    const match: FilterQuery<Order> = { status: "PAID" };
    if (query.storeId) match.storeId = query.storeId;
    if (query.itemId) match["lines.itemId"] = query.itemId;
    const pipeline: PipelineStage[] = [
      { $match: match },
      { $sort: { paidAt: -1 } },
      { $limit: query.limit },
      {
        $project: {
          _id: 0,
          orderId: 1,
          buyer: 1,
          paidAt: 1,
          txHash: 1,
          totalWei: { $toString: "$totalWei" },
          quantity: query.itemId
            ? { $sum: { $map: { input: { $filter: { input: "$lines", cond: { $eq: ["$$this.itemId", query.itemId] } } }, in: "$$this.quantity" } } }
            : { $sum: "$lines.quantity" },
        },
      },
    ];
    return this.orders.aggregate(pipeline);
  }

  /** Open checkouts are those the soft-stock query counts too: PENDING with an unexpired signed deadline. */
  private async assertUnderPendingCap(buyer: string): Promise<void> {
    const max = this.config.MAX_PENDING_ORDERS_PER_BUYER;
    const open = await this.orders.countDocuments({ buyer, status: "PENDING", deadline: { $gt: new Date() } });
    if (open >= max) throw new AppError("TOO_MANY_PENDING_ORDERS", 429, "Finish or let expire your open checkouts first", { max });
  }

  /** Copies held by unexpired PENDING orders, per item (soft reservation). */
  private async pendingQuantities(itemIds: string[]): Promise<Map<string, number>> {
    const rows = await this.orders.aggregate<{ _id: string; quantity: number }>([
      { $match: { status: "PENDING", deadline: { $gt: new Date() }, "lines.itemId": { $in: itemIds } } },
      { $unwind: "$lines" },
      { $match: { "lines.itemId": { $in: itemIds } } },
      { $group: { _id: "$lines.itemId", quantity: { $sum: "$lines.quantity" } } },
    ]);
    return new Map(rows.map((row) => [row._id, row.quantity]));
  }

  private list(filter: FilterQuery<Order>, query: SalesQueryDto): Promise<Page<OrderView>> {
    return paginate(
      query,
      async (skip, limit) => (await this.orders.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit)).map(toOrderView),
      () => this.orders.countDocuments(filter),
    );
  }

  private async byId(id: string): Promise<OrderDocument> {
    const order = isValidObjectId(id) ? await this.orders.findById(id) : null;
    if (!order) throw orderNotFound();
    return order;
  }
}
