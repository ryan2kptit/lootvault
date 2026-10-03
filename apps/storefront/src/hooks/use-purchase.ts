"use client";

import { checkoutFromWire, lootVault1155Abi } from "@lootvault/shared";
import type { Api, CartLineInput, Order } from "@lootvault/web-shared/api";
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

/** The transaction is on its way (or mined): from here on the order must never be paid a second time. */
interface SentPayment {
  orderId: string;
  txHash: Hex;
}

export type PurchaseState =
  | { status: "idle" }
  | { status: "running"; step: number; sent?: SentPayment }
  /** A failure before any transaction was sent: safe to try again. */
  | { status: "error"; step: number; error: string }
  /** The payment was sent but the server has not confirmed it yet. Not an error, and never retryable. */
  | { status: "submitted"; step: number; sent: SentPayment }
  | { status: "done"; step: number; order: Order };

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

/**
 * POST /orders/:id/confirm; until PAID, poll GET /orders/:id. Errors (5xx, network) are retried until the deadline,
 * because the payment is already on-chain. Resolves to null when the order is still unconfirmed at the deadline
 * or the caller left: the indexer marks it PAID on its own.
 */
async function confirmPayment(api: Api, { orderId, txHash }: SentPayment, signal: AbortSignal): Promise<Order | null> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  const confirmed = await api.orders.confirm(orderId, txHash).catch(() => null);
  if (confirmed?.status === "PAID") return confirmed.order;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS, signal);
    if (signal.aborted) return null;
    const order = await api.orders.get(orderId).catch(() => null);
    if (order?.status === "PAID") return order;
  }
  return null;
}

interface PurchaseCallbacks {
  /** The block with the payment succeeded (the cart can be emptied). Always called, even if the user has left the page. */
  onReceipt?: () => void;
  /** The order is PAID. Not called after the component unmounted. */
  onPaid?: (order: Order) => void;
  /** The payment was sent but its confirmation is still pending. Not called after unmount. */
  onPending?: () => void;
  /** A failure before anything was sent, with the raw error so the caller can react (SoldOut, INSUFFICIENT_STOCK, PriceChangedError, …). Not called after unmount. */
  onError?: (error: unknown) => void;
}

/**
 * The purchase flow behind TxStatusStepper: create the order (signed checkout) -> compare its total with the one
 * the buyer saw -> purchase() in the wallet -> wait for the receipt -> confirm with order-svc.
 *
 * Once the transaction hash exists, the flow can no longer end in a retryable error: a confirmation failure or
 * timeout finishes as "submitted", and the hook refuses another purchase until the page is left.
 */
export function usePurchase({ onReceipt, onPaid, onPending, onError }: PurchaseCallbacks = {}) {
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

  /** `shownTotalWei` is the total the buyer saw; the order is only paid if the server agrees with it. */
  async function purchase(lines: CartLineInput[], shownTotalWei: bigint): Promise<void> {
    const signal = lifetime.current?.signal;
    if (!signal || inFlight.current || awaitingConfirmation.current) return;
    inFlight.current = true;
    const show = (next: PurchaseState) => {
      if (!signal.aborted) setState(next);
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

    try {
      advance(STEP.create);
      const { order, purchase: tx } = await api.orders.checkout(lines);
      if (BigInt(tx.value) !== shownTotalWei) throw new PriceChangedError(order);

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

      advance(STEP.mine);
      // A receipt that cannot be read (timeout, network) is not a failure: the transaction may well succeed.
      const receipt = await waitForTransactionReceipt(config, { hash: txHash, chainId: tx.chainId }).catch(() => null);
      if (receipt?.status === "reverted") {
        awaitingConfirmation.current = false;
        fail(new Error("The transaction reverted on-chain. Nothing was charged except gas."));
        return;
      }
      if (receipt?.status === "success") onReceipt?.();
    } catch (error) {
      fail(error);
      return;
    }

    // The payment is sent. Nothing below may end in a retryable error.
    show({ status: "running", step: STEP.confirm, sent });
    const paid = await confirmPayment(api, sent, signal);
    inFlight.current = false;
    for (const queryKey of ACCOUNT_QUERY_KEYS) void queryClient.invalidateQueries({ queryKey });
    if (paid) {
      awaitingConfirmation.current = false;
      show({ status: "done", step: STEP.paid, order: paid });
      if (!signal.aborted) onPaid?.(paid);
    } else {
      show({ status: "submitted", step: STEP.confirm, sent });
      if (!signal.aborted) onPending?.();
    }
  }

  return { state, purchase };
}
