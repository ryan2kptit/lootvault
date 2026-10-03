"use client";

import { checkoutFromWire, lootVault1155Abi } from "@lootvault/shared";
import { type Api, isApiError, type Order } from "@lootvault/web-shared/api";
import { type CartLine, type CartState, cartTotalWei, MAX_LINE_QUANTITY } from "@lootvault/web-shared/cart";
import { errorMessage, useApi } from "@lootvault/web-shared/wallet";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { Hex } from "viem";
import { useConfig, useConnection } from "wagmi";
import { simulateContract, waitForTransactionReceipt, writeContract } from "wagmi/actions";

export const PURCHASE_STEPS = ["Create order", "Confirm in your wallet", "Wait for the block", "Confirm payment", "Paid"] as const;
/** Index of each step in PURCHASE_STEPS. */
const STEP = { create: 0, sign: 1, mine: 2, confirm: 3, paid: 4 } as const;

const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_MS = 60_000;

/** Query keys of the collection and order lists in /me; the address part is matched by prefix. */
const ACCOUNT_QUERY_KEYS = [["holdings"], ["my-orders"]] as const;

const UNCERTAIN_PAYMENT_MESSAGE = "The transaction did not go through — check My orders before trying again.";

/** The transaction is on its way (or mined): from here on the order must never be paid a second time. */
interface SentPayment {
  orderId: string;
  txHash: Hex;
}

export type PurchaseState =
  | { status: "idle" }
  | { status: "running"; step: number; sent?: SentPayment }
  /** A failure before any transaction was sent (or a reverted one): safe to try again. */
  | { status: "error"; step: number; error: string; sent?: undefined }
  /** The payment may have been sent, but the server refused to confirm it: check My orders before trying again. */
  | { status: "error"; step: number; error: string; sent: SentPayment }
  /** The payment was sent but the server has not confirmed it yet. Not an error, and never retryable. */
  | { status: "submitted"; step: number; sent: SentPayment }
  | { status: "done"; step: number; order: Order };

/** True while buying again could pay for the same lines twice: running, sent but unconfirmed, or refused after sending. */
export function isPurchaseLocked(state: PurchaseState): boolean {
  return state.status === "running" || state.status === "submitted" || (state.status === "error" && state.sent !== undefined);
}

/** The server priced the order differently from what the buyer was shown, so nothing was sent to the wallet. */
export class PriceChangedError extends Error {
  constructor(readonly order: Order) {
    super("Prices changed — review the new total and check out again.");
    this.name = "PriceChangedError";
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener("abort", done);
  });
}

type Confirmation = { outcome: "paid"; order: Order } | { outcome: "refused" } | { outcome: "pending" };

/**
 * POST /orders/:id/confirm; until PAID, poll GET /orders/:id. Errors (5xx, network) are retried until the deadline,
 * because the payment is already on-chain. "pending" means the order is still unconfirmed at the deadline or the
 * caller left: the indexer marks it PAID on its own. "refused" (a TX_INVALID / TX_MISMATCH 4xx) is only reported
 * when the receipt could not be read, since then it is the only word we have on what happened to the transaction.
 */
async function confirmPayment(api: Api, { orderId, txHash }: SentPayment, signal: AbortSignal, receiptRead: boolean): Promise<Confirmation> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  try {
    const confirmed = await api.orders.confirm(orderId, txHash);
    if (confirmed.status === "PAID") return { outcome: "paid", order: confirmed.order };
  } catch (error) {
    const refused = isApiError(error) && error.status >= 400 && error.status < 500 && (error.code === "TX_INVALID" || error.code === "TX_MISMATCH");
    if (refused && !receiptRead) return { outcome: "refused" };
  }
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS, signal);
    if (signal.aborted) return { outcome: "pending" };
    const order = await api.orders.get(orderId).catch(() => null);
    if (order?.status === "PAID") return { outcome: "paid", order };
  }
  return { outcome: "pending" };
}

interface PurchaseCallbacks {
  /**
   * The cart the purchased lines come from, if any. The hook takes those lines out of it the moment the transaction
   * hash exists, and puts them back only when the receipt says the transaction reverted.
   */
  cart?: Pick<CartState, "add">;
  /** The order is PAID. Not called after the component unmounted. */
  onPaid?: (order: Order) => void;
  /** The payment was sent but its confirmation is still pending. Not called after unmount. */
  onPending?: () => void;
  /** A failure with the raw error so the caller can react (SoldOut, INSUFFICIENT_STOCK, PriceChangedError, …). Not called after unmount. */
  onError?: (error: unknown) => void;
}

/**
 * The purchase flow behind TxStatusStepper: create the order (signed checkout) -> compare its total with the one
 * the buyer saw -> purchase() in the wallet -> wait for the receipt -> confirm with order-svc.
 *
 * Once the transaction hash exists the flow can no longer end in a retryable error and the purchased lines are out
 * of the cart: a confirmation failure or timeout finishes as "submitted", and the hook refuses another purchase until
 * the page is left. Only a receipt that says "reverted" (no money moved) puts the lines back and allows a retry.
 */
export function usePurchase({ cart, onPaid, onPending, onError }: PurchaseCallbacks = {}) {
  const api = useApi();
  const config = useConfig();
  const { address } = useConnection();
  const queryClient = useQueryClient();
  const [state, setState] = useState<PurchaseState>({ status: "idle" });
  const lifetime = useRef<AbortController | null>(null);
  const inFlight = useRef(false);
  const awaitingConfirmation = useRef(false);

  // Aborted on unmount (and re-created after React Strict Mode's simulated one), so polling stops when the user leaves.
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    return () => controller.abort();
  }, []);

  /** `lines` are what the buyer saw; the order is only paid if the server's total agrees with theirs. */
  async function purchase(lines: CartLine[]): Promise<void> {
    const signal = lifetime.current?.signal;
    if (!signal || inFlight.current || awaitingConfirmation.current) return;
    inFlight.current = true;
    const show = (next: PurchaseState) => {
      if (!signal.aborted) setState(next);
    };

    // `add` with a negative quantity lowers a line (removing it at 0) and a positive one raises it, both against the
    // store's current lines, so lines the buyer added elsewhere while the transaction was mining are left alone.
    const moveInCart = (direction: 1 | -1) => {
      for (const { quantity, ...line } of lines) cart?.add(line, direction * quantity, MAX_LINE_QUANTITY);
    };

    let step: number = STEP.create;
    let sent: SentPayment | undefined;
    const advance = (next: number) => {
      step = next;
      show({ status: "running", step, sent });
    };
    /** A failure before the payment was sent (or a reverted one): nothing was paid, so a new attempt is safe. */
    const fail = (error: unknown) => {
      inFlight.current = false;
      show({ status: "error", step, error: errorMessage(error) });
      if (!signal.aborted) onError?.(error);
    };

    let receiptRead = false;
    try {
      advance(STEP.create);
      const { order, purchase: tx } = await api.orders.checkout(lines.map(({ itemId, quantity }) => ({ itemId, quantity })));
      if (BigInt(tx.value) !== cartTotalWei(lines)) throw new PriceChangedError(order);

      advance(STEP.sign);
      const { request } = await simulateContract(config, {
        account: address,
        address: tx.contract,
        abi: lootVault1155Abi,
        functionName: "purchase",
        args: [checkoutFromWire(tx.checkout), tx.signature],
        value: BigInt(tx.value),
        chainId: tx.chainId,
      });
      const txHash = await writeContract(config, request);
      sent = { orderId: order.id, txHash };
      awaitingConfirmation.current = true;
      moveInCart(-1);

      advance(STEP.mine);
      // A receipt that cannot be read (timeout, network) is not a failure: the transaction may well succeed.
      const receipt = await waitForTransactionReceipt(config, { hash: txHash, chainId: tx.chainId }).catch(() => null);
      if (receipt?.status === "reverted") {
        awaitingConfirmation.current = false;
        moveInCart(1);
        fail(new Error("The transaction reverted on-chain. Nothing was charged except gas."));
        return;
      }
      receiptRead = receipt !== null;
    } catch (error) {
      fail(error);
      return;
    }

    // The payment is sent. Nothing below may end in a retryable error.
    show({ status: "running", step: STEP.confirm, sent });
    const confirmation = await confirmPayment(api, sent, signal, receiptRead);
    inFlight.current = false;
    for (const queryKey of ACCOUNT_QUERY_KEYS) void queryClient.invalidateQueries({ queryKey });
    if (confirmation.outcome === "paid") {
      awaitingConfirmation.current = false;
      show({ status: "done", step: STEP.paid, order: confirmation.order });
      if (!signal.aborted) onPaid?.(confirmation.order);
    } else if (confirmation.outcome === "refused") {
      show({ status: "error", step: STEP.confirm, error: UNCERTAIN_PAYMENT_MESSAGE, sent });
    } else {
      show({ status: "submitted", step: STEP.confirm, sent });
      if (!signal.aborted) onPending?.();
    }
  }

  return { state, purchase };
}
