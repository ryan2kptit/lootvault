"use client";

import { checkoutFromWire, lootVault1155Abi } from "@lootvault/shared";
import type { Api, CartLineInput, Order } from "@lootvault/web-shared/api";
import { errorMessage, useApi } from "@lootvault/web-shared/wallet";
import { useState } from "react";
import type { Hex } from "viem";
import { useConfig, useConnection } from "wagmi";
import { simulateContract, waitForTransactionReceipt, writeContract } from "wagmi/actions";

export const PURCHASE_STEPS = ["Create order", "Confirm in your wallet", "Wait for the block", "Confirm payment", "Paid"] as const;
/** Index of each step in PURCHASE_STEPS. */
const STEP = { create: 0, sign: 1, mine: 2, confirm: 3, paid: 4 } as const;

const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_MS = 60_000;

export type PurchaseState =
  | { status: "idle" }
  | { status: "running"; step: number }
  | { status: "error"; step: number; error: string }
  | { status: "done"; step: number; order: Order };

/** POST /orders/:id/confirm; on 202 (receipt not indexed yet) poll GET /orders/:id until PAID. */
async function confirmPayment(api: Api, orderId: string, txHash: Hex): Promise<Order> {
  const result = await api.orders.confirm(orderId, txHash);
  if (result.status === "PAID") return result.order;
  for (const deadline = Date.now() + POLL_TIMEOUT_MS; Date.now() < deadline; ) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    const order = await api.orders.get(orderId);
    if (order.status === "PAID") return order;
  }
  throw new Error("Payment is taking longer than usual. It will appear in My orders once confirmed.");
}

/**
 * The purchase flow behind TxStatusStepper: create the order (signed checkout) -> purchase() in the wallet ->
 * wait for the receipt -> confirm with order-svc. A failure stops at its step; `onError` gets the raw error
 * so the caller can react (refresh stock after SoldOut, lower the cart after INSUFFICIENT_STOCK, …).
 */
export function usePurchase({ onError }: { onError?: (error: unknown) => void } = {}) {
  const api = useApi();
  const config = useConfig();
  const { address } = useConnection();
  const [state, setState] = useState<PurchaseState>({ status: "idle" });

  async function purchase(lines: CartLineInput[]): Promise<Order | null> {
    let step: number = STEP.create;
    const advance = (next: number) => {
      step = next;
      setState({ status: "running", step });
    };
    try {
      advance(STEP.create);
      const { order, purchase: tx } = await api.orders.checkout(lines);

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
      const hash = await writeContract(config, request);

      advance(STEP.mine);
      const receipt = await waitForTransactionReceipt(config, { hash, chainId: tx.chainId });
      if (receipt.status !== "success") throw new Error("The transaction reverted on-chain. Nothing was charged except gas.");

      advance(STEP.confirm);
      const paid = await confirmPayment(api, order.id, hash);
      setState({ status: "done", step: STEP.paid, order: paid });
      return paid;
    } catch (error) {
      setState({ status: "error", step, error: errorMessage(error) });
      onError?.(error);
      return null;
    }
  }

  return { state, purchase };
}
