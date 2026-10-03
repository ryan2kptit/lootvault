// Minimal LootVault API client for scripts (seed / demos): SIWE login, JSON calls, image upload.
import { checkoutFromWire, lootVault1155Abi } from "@lootvault/shared";
import { createPublicClient, createWalletClient, defineChain, http } from "viem";
import { createSiweMessage } from "viem/siwe";

import { loadRootEnv } from "./root-env.mjs";

export const env = loadRootEnv();

export const URLS = {
  auth: `http://localhost:${env.AUTH_PORT ?? 3001}`,
  catalog: `http://localhost:${env.CATALOG_PORT ?? 3002}`,
  orders: `http://localhost:${env.ORDER_PORT ?? 3003}`,
  indexer: `http://localhost:${env.INDEXER_PORT ?? 3004}`,
};

export class ApiError extends Error {
  constructor(status, body, request) {
    super(`${request} -> ${status} ${body?.error?.code ?? ""} ${body?.error?.message ?? ""}`.trim());
    this.status = status;
    this.code = body?.error?.code;
  }
}

export async function api(base, path, { method = "GET", token, body } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const json = text ? JSON.parse(text) : undefined;
  if (!response.ok) throw new ApiError(response.status, json, `${method} ${path}`);
  return json;
}

/** Sign-In with Ethereum as `account`; returns a bearer token. */
export async function login(account, domain = "localhost:3000") {
  const { nonce } = await api(URLS.auth, `/auth/nonce?address=${account.address}`);
  const message = createSiweMessage({
    address: account.address,
    chainId: Number(env.CHAIN_ID),
    domain,
    nonce,
    uri: `http://${domain}`,
    version: "1",
    statement: "Sign in to LootVault",
  });
  const { accessToken } = await api(URLS.auth, "/auth/verify", {
    method: "POST",
    body: { message, signature: await account.signMessage({ message }) },
  });
  return accessToken;
}

/** Uploads a PNG through a presigned POST and returns its public URL. */
export async function uploadPng(token, png) {
  const presign = await api(URLS.catalog, "/catalog/uploads/presign", { method: "POST", token, body: { contentType: "image/png" } });
  const form = new FormData();
  for (const [key, value] of Object.entries(presign.fields)) form.append(key, value);
  form.append("file", new Blob([png], { type: "image/png" }), "card.png");
  const response = await fetch(presign.url, { method: "POST", body: form });
  if (!response.ok) throw new Error(`Image upload failed: ${response.status} ${await response.text()}`);
  return presign.publicUrl;
}

/** The caller's store, created if missing. */
export async function ensureStore(token, store) {
  try {
    return await api(URLS.catalog, "/catalog/stores/me", { token });
  } catch (error) {
    if (error.status !== 404) throw error;
    return api(URLS.catalog, "/catalog/stores", { method: "POST", token, body: store });
  }
}

export async function waitFor(label, check, { timeoutMs = 30_000, intervalMs = 500 } = {}) {
  const started = Date.now();
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() - started > timeoutMs) throw new Error(`Timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

export const localChain = defineChain({
  id: Number(env.CHAIN_ID),
  name: "anvil",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [env.RPC_URL] } },
});

export const publicClient = createPublicClient({ chain: localChain, transport: http(env.RPC_URL) });
export const walletFor = (account) => createWalletClient({ account, chain: localChain, transport: http(env.RPC_URL) });

/**
 * Sends LootVault1155.purchase for a checkout returned by POST /orders/checkout.
 * Passing `gas` skips the pre-flight estimate, so a doomed purchase is still mined (and reverts on-chain).
 */
export function payCheckout(account, purchase, { gas } = {}) {
  return walletFor(account).writeContract({
    address: purchase.contract,
    abi: lootVault1155Abi,
    functionName: "purchase",
    args: [checkoutFromWire(purchase.checkout), purchase.signature],
    value: BigInt(purchase.value),
    ...(gas ? { gas } : {}),
  });
}
