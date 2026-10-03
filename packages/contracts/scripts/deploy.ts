// Deploys LootVault1155 to the network given by --network and records the result
// in deployments/<network>.json (address + start block for the indexer).
import { mkdirSync, writeFileSync } from "node:fs";

import { network } from "hardhat";
import { getAddress } from "viem";

const LOCAL_CHAIN_ID = 31337;

// anvil/hardhat default accounts #0-#9 (public keys from the "test test ... junk" mnemonic).
const ANVIL_DEFAULT_ACCOUNTS = new Set([
  "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
  "0x70997970c51812dc3a010c7d01b50e0d17dc79c8",
  "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc",
  "0x90f79bf6eb2c4f870365e785982e1f101e93b906",
  "0x15d34aaf54267db7d7c367839aaf71a00a2c6a65",
  "0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc",
  "0x976ea74026e726554db657fa54763abd0c3a0aa9",
  "0x14dc79964da2c08b23698b3d3cc7ca32193d9955",
  "0x23618e81e3f5cdf7f54c3d65f7fbc0abf5b21e8f",
  "0xa0ee7a142d267c1f36714e4a8f75612f20a79720",
]);

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env ${name} (see .env.example)`);
  return value;
}

const { viem, networkName } = await network.create();
if (networkName === "default") throw new Error("Pass --network (localhost|baseSepolia)");

const publicClient = await viem.getPublicClient();
const [deployer] = await viem.getWalletClients();
const chainId = await publicClient.getChainId();

const platformSigner = getAddress(required("PLATFORM_SIGNER_ADDRESS"));
const treasury = getAddress(required("TREASURY_ADDRESS"));
const baseUri = required("METADATA_BASE_URI");

if (chainId !== LOCAL_CHAIN_ID) {
  const localOnly = (name: string) =>
    new Error(`Refusing to deploy to chain ${chainId} with local-only ${name}; set real values in the environment`);
  if (ANVIL_DEFAULT_ACCOUNTS.has(platformSigner.toLowerCase())) throw localOnly("PLATFORM_SIGNER_ADDRESS");
  if (ANVIL_DEFAULT_ACCOUNTS.has(treasury.toLowerCase())) throw localOnly("TREASURY_ADDRESS");
  if (baseUri.includes("localhost") || baseUri.includes("127.0.0.1")) throw localOnly("METADATA_BASE_URI");
}

const { contract, deploymentTransaction } = await viem.sendDeploymentTransaction("LootVault1155", [
  baseUri,
  deployer.account.address,
  platformSigner,
  treasury,
]);
const receipt = await publicClient.waitForTransactionReceipt({ hash: deploymentTransaction.hash });

const deployment = {
  network: networkName,
  chainId,
  address: contract.address,
  startBlock: Number(receipt.blockNumber),
  owner: getAddress(deployer.account.address),
  platformSigner,
  treasury,
  baseUri,
  txHash: deploymentTransaction.hash,
  deployedAt: new Date().toISOString(),
};

const dir = new URL("../deployments/", import.meta.url);
mkdirSync(dir, { recursive: true });
writeFileSync(new URL(`${networkName}.json`, dir), `${JSON.stringify(deployment, null, 2)}\n`);
console.log(JSON.stringify(deployment, null, 2));
