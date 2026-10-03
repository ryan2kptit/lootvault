// Guards for scripts that must only ever touch the local stack (anvil + moto). They send
// transactions with the public anvil keys or create AWS resources, so a .env that points at a
// real chain or real AWS must stop them before anything is sent. Messages name the offending
// host or chain id, never URL credentials, paths or keys.
const LOCAL_CHAIN_ID = 31337;
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const RPC_TIMEOUT_MS = 5000;

function loopbackHost(url, variable) {
  let host;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    throw new Error(`${variable} is not a valid URL; local-only scripts need a loopback address such as http://127.0.0.1:8545`);
  }
  return { host, local: LOOPBACK_HOSTS.has(host) };
}

/** Throws unless `rpcUrl` is a loopback host that reports chainId 31337 (anvil). */
export async function assertLocalRpc(rpcUrl) {
  if (!rpcUrl) throw new Error("RPC_URL is not set; local-only scripts need the local anvil RPC (http://127.0.0.1:8545)");
  const { host, local } = loopbackHost(rpcUrl, "RPC_URL");
  if (!local) throw new Error(`refusing to run: RPC_URL host "${host}" is not loopback; this script only targets the local anvil chain`);

  let chainId;
  try {
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
      signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
    });
    chainId = Number.parseInt((await response.json()).result, 16);
  } catch (error) {
    throw new Error(`cannot read eth_chainId from RPC_URL host "${host}" (${error.cause?.code ?? error.message}); is anvil running? run \`npm run infra:up\``);
  }
  if (chainId !== LOCAL_CHAIN_ID) {
    throw new Error(`refusing to run: RPC_URL host "${host}" reports chainId ${chainId}, expected ${LOCAL_CHAIN_ID} (local anvil)`);
  }
}

/** Throws unless AWS_ENDPOINT_URL is set and points at a loopback host (the moto emulator). */
export function assertLocalAwsEndpoint(endpoint) {
  if (!endpoint) {
    throw new Error("AWS_ENDPOINT_URL is not set, so the AWS SDK would target real AWS; set it to the local emulator (http://localhost:4566)");
  }
  const { host, local } = loopbackHost(endpoint, "AWS_ENDPOINT_URL");
  if (!local) throw new Error(`refusing to run: AWS_ENDPOINT_URL host "${host}" is not loopback; this script only targets the local emulator`);
}
