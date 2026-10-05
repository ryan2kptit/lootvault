import { type Address, getAddress, numberToHex, RpcRequestError } from "viem";
import { rpc } from "viem/utils";
import { createConnector } from "wagmi";

/**
 * anvil's default accounts (public test keys, local chain only), by demo role.
 * Same accounts as scripts/lib/accounts.mjs. Anvil keeps them unlocked, so the node signs for them:
 * the browser never holds a private key.
 */
export const DEMO_ROLES = [
  { id: "publisherA", label: "Publisher A", address: "0x90F79bf6EB2c4f870365E785982E1f101E93b906" }, // #3
  { id: "publisherB", label: "Publisher B", address: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65" }, // #4
  { id: "buyer1", label: "Buyer 1", address: "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc" }, // #5
  { id: "buyer2", label: "Buyer 2", address: "0x976EA74026E726554dB657fA54763abd0C3a0aa9" }, // #6
  { id: "buyer3", label: "Buyer 3", address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" }, // #2 (also the fee treasury)
] as const satisfies readonly { id: string; label: string; address: Address }[];

type DemoRole = (typeof DEMO_ROLES)[number];
export type DemoRoleId = DemoRole["id"];

export const DEMO_WALLET_ID = "demoWallet";

export function demoRoleFor(address: string | undefined): DemoRole | undefined {
  return DEMO_ROLES.find((role) => role.address.toLowerCase() === address?.toLowerCase());
}

export type DemoWalletProperties = {
  /** Switches the account; when connected, the app sees an account change (and drops the old session). */
  selectRole(role: DemoRoleId): Promise<void>;
};

interface DemoWalletProvider {
  request(args: { method: string; params?: unknown }): Promise<unknown>;
}

type DemoWalletStorage = { "demoWallet.role": DemoRoleId; "demoWallet.connected": boolean };

/**
 * A wallet backed by anvil's unlocked accounts, in the spirit of wagmi's `mock` connector but with one
 * selectable account and a connection that survives reloads. Account and chain requests are answered
 * locally; `personal_sign` becomes anvil's `eth_sign`; everything else (eth_sendTransaction included)
 * goes to the node, which signs.
 */
export function demoWallet(rpcUrl: string) {
  let role: DemoRole = DEMO_ROLES[0];

  return createConnector<DemoWalletProvider, DemoWalletProperties, DemoWalletStorage>((config) => {
    const chainId = config.chains[0].id;

    async function forward(method: string, params: unknown): Promise<unknown> {
      const body = { method, params };
      const { result, error } = await rpc.http(rpcUrl, { body });
      if (error) throw new RpcRequestError({ body, error, url: rpcUrl });
      return result;
    }

    async function isAuthorized(): Promise<boolean> {
      return Boolean(await config.storage?.getItem("demoWallet.connected"));
    }

    const provider: DemoWalletProvider = {
      async request({ method, params }) {
        switch (method) {
          case "eth_chainId":
            return numberToHex(chainId);
          case "eth_accounts":
          case "eth_requestAccounts":
            return [role.address];
          case "personal_sign": {
            const [message, account] = params as [string, string];
            return forward("eth_sign", [account, message]);
          }
          default:
            return forward(method, params);
        }
      },
    };

    return {
      id: DEMO_WALLET_ID,
      name: "Demo wallet (anvil)",
      type: DEMO_WALLET_ID,
      async setup() {
        const saved = await config.storage?.getItem("demoWallet.role");
        role = DEMO_ROLES.find((r) => r.id === saved) ?? role;
      },
      async connect() {
        await config.storage?.setItem("demoWallet.connected", true);
        // wagmi types `accounts` by a generic flag (withCapabilities) this connector does not support.
        return { accounts: [getAddress(role.address)] as never, chainId };
      },
      async disconnect() {
        await config.storage?.removeItem("demoWallet.connected");
      },
      async getAccounts() {
        return [getAddress(role.address)];
      },
      async getChainId() {
        return chainId;
      },
      async getProvider() {
        return provider;
      },
      isAuthorized,
      async selectRole(id) {
        role = DEMO_ROLES.find((r) => r.id === id) ?? role;
        await config.storage?.setItem("demoWallet.role", role.id);
        if (await isAuthorized()) config.emitter.emit("change", { accounts: [getAddress(role.address)] });
      },
      onAccountsChanged(accounts) {
        config.emitter.emit("change", { accounts: accounts.map((account) => getAddress(account)) });
      },
      onChainChanged(id) {
        config.emitter.emit("change", { chainId: Number(id) });
      },
      onDisconnect() {
        config.emitter.emit("disconnect");
      },
    };
  });
}
