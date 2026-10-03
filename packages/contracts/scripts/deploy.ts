// Deploys LootVault1155 to the network given by --network and records the result
// in deployments/<network>.json (address + start block for the indexer).
import { mkdirSync, writeFileSync } from "node:fs";

import { network } from "hardhat";
import { getAddress, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env ${name} (see .env.example)`);
  return value;
}

const { viem, networkName } = await network.create();
const publicClient = await viem.getPublicClient();
const [deployer] = await viem.getWalletClients();

const platformSigner = privateKeyToAccount(required("PLATFORM_SIGNER_KEY") as Hex).address;
const treasury = getAddress(required("TREASURY_ADDRESS"));
const baseUri = required("METADATA_BASE_URI");

const { contract, deploymentTransaction } = await viem.sendDeploymentTransaction("LootVault1155", [
  baseUri,
  deployer.account.address,
  platformSigner,
  treasury,
]);
const receipt = await publicClient.waitForTransactionReceipt({ hash: deploymentTransaction.hash });

const deployment = {
  network: networkName,
  chainId: await publicClient.getChainId(),
  address: contract.address,
  startBlock: Number(receipt.blockNumber),
  owner: deployer.account.address,
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
