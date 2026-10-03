import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { checkoutTypedData, type CheckoutLine, type CheckoutMessage } from "@lootvault/shared";
import { network } from "hardhat";
import { getAddress, hashTypedData, keccak256, parseEther, toHex, zeroAddress, type Address, type Hex } from "viem";

describe("LootVault1155", async () => {
  const { viem, networkHelpers } = await network.create();
  const publicClient = await viem.getPublicClient();
  const [owner, platform, treasury, creatorA, creatorB, buyer, stranger] = await viem.getWalletClients();
  const chainId = await publicClient.getChainId();
  const PRICE = parseEther("0.01");

  async function deploy() {
    const vault = await viem.deployContract("LootVault1155", [
      "https://media.example/metadata/{id}.json",
      owner.account.address,
      platform.account.address,
      treasury.account.address,
    ]);
    const asBuyer = await viem.getContractAt("LootVault1155", vault.address, { client: { wallet: buyer } });
    const asStranger = await viem.getContractAt("LootVault1155", vault.address, { client: { wallet: stranger } });
    return { vault, asBuyer, asStranger };
  }

  let orderCounter = 0;
  const nextOrderId = (): Hex => keccak256(toHex(`order-${++orderCounter}`));
  const blockTime = async () => (await publicClient.getBlock()).timestamp;

  function line(overrides: Partial<CheckoutLine> = {}): CheckoutLine {
    return { tokenId: 1n, creator: creatorA.account.address, quantity: 1n, unitPrice: PRICE, maxSupply: 5n, ...overrides };
  }

  async function checkout(overrides: Partial<CheckoutMessage> = {}): Promise<CheckoutMessage> {
    return { orderId: nextOrderId(), buyer: buyer.account.address, lines: [line()], deadline: (await blockTime()) + 300n, ...overrides };
  }

  async function sign(vaultAddress: Address, message: CheckoutMessage, signer = platform): Promise<Hex> {
    return signer.signTypedData({ account: signer.account, ...checkoutTypedData(chainId, vaultAddress, message) });
  }

  const totalOf = (c: CheckoutMessage) => c.lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0n);

  it("hashCheckout matches the off-chain EIP-712 digest", async () => {
    const { vault } = await deploy();
    const c = await checkout({ lines: [line(), line({ tokenId: 2n, quantity: 3n })] });
    const onChain = await vault.read.hashCheckout([c]);
    assert.equal(onChain, hashTypedData(checkoutTypedData(chainId, vault.address, c)));
  });

  it("mints to the buyer, splits payment 97.5/2.5 and emits Purchased", async () => {
    const { vault, asBuyer } = await deploy();
    const c = await checkout({ lines: [line({ quantity: 2n })] });
    const total = totalOf(c);
    const fee = (total * 250n) / 10_000n;

    const hash = await asBuyer.write.purchase([c, await sign(vault.address, c)], { value: total });

    await viem.assertions.balancesHaveChanged(hash, [
      { address: buyer.account.address, amount: -total },
      { address: creatorA.account.address, amount: total - fee },
      { address: treasury.account.address, amount: fee },
    ]);
    await viem.assertions.emitWithArgs(hash, vault, "Purchased", [c.orderId, getAddress(buyer.account.address), total, fee]);
    assert.equal(await vault.read.balanceOf([buyer.account.address, 1n]), 2n);
    assert.equal(await vault.read.minted([1n]), 2n);
    assert.equal(await vault.read.creatorOf([1n]), getAddress(creatorA.account.address));
  });

  it("pays every creator in a multi-line cart", async () => {
    const { vault, asBuyer } = await deploy();
    const c = await checkout({
      lines: [line({ tokenId: 1n, quantity: 1n }), line({ tokenId: 2n, creator: creatorB.account.address, quantity: 2n })],
    });
    const hash = await asBuyer.write.purchase([c, await sign(vault.address, c)], { value: totalOf(c) });

    await viem.assertions.balancesHaveChanged(hash, [
      { address: creatorA.account.address, amount: PRICE - (PRICE * 250n) / 10_000n },
      { address: creatorB.account.address, amount: 2n * PRICE - (2n * PRICE * 250n) / 10_000n },
    ]);
    assert.equal(await vault.read.balanceOf([buyer.account.address, 2n]), 2n);
  });

  it("reverts SoldOut once the supply cap would be exceeded", async () => {
    const { vault, asBuyer } = await deploy();
    const first = await checkout({ lines: [line({ quantity: 3n })] });
    await asBuyer.write.purchase([first, await sign(vault.address, first)], { value: totalOf(first) });

    const second = await checkout({ lines: [line({ quantity: 3n })] });
    await viem.assertions.revertWithCustomErrorWithArgs(
      asBuyer.write.purchase([second, await sign(vault.address, second)], { value: totalOf(second) }),
      vault,
      "SoldOut",
      [1n],
    );
  });

  it("reverts Expired after the deadline", async () => {
    const { vault, asBuyer } = await deploy();
    const c = await checkout({ deadline: (await blockTime()) - 1n });
    await viem.assertions.revertWithCustomError(
      asBuyer.write.purchase([c, await sign(vault.address, c)], { value: totalOf(c) }),
      vault,
      "Expired",
    );
  });

  it("reverts WrongBuyer when someone else submits the checkout", async () => {
    const { vault, asStranger } = await deploy();
    const c = await checkout();
    await viem.assertions.revertWithCustomError(
      asStranger.write.purchase([c, await sign(vault.address, c)], { value: totalOf(c) }),
      vault,
      "WrongBuyer",
    );
  });

  it("reverts OrderUsed when a signed checkout is replayed", async () => {
    const { vault, asBuyer } = await deploy();
    const c = await checkout();
    const sig = await sign(vault.address, c);
    await asBuyer.write.purchase([c, sig], { value: totalOf(c) });
    await viem.assertions.revertWithCustomError(asBuyer.write.purchase([c, sig], { value: totalOf(c) }), vault, "OrderUsed");
  });

  it("reverts InvalidSignature for a non-platform signer or a tampered price", async () => {
    const { vault, asBuyer } = await deploy();
    const c = await checkout();
    await viem.assertions.revertWithCustomError(
      asBuyer.write.purchase([c, await sign(vault.address, c, stranger)], { value: totalOf(c) }),
      vault,
      "InvalidSignature",
    );

    const sig = await sign(vault.address, c);
    const tampered = { ...c, lines: [line({ unitPrice: 1n })] };
    await viem.assertions.revertWithCustomError(
      asBuyer.write.purchase([tampered, sig], { value: totalOf(tampered) }),
      vault,
      "InvalidSignature",
    );
  });

  it("reverts WrongPayment when msg.value differs from the total", async () => {
    const { vault, asBuyer } = await deploy();
    const c = await checkout();
    await viem.assertions.revertWithCustomError(
      asBuyer.write.purchase([c, await sign(vault.address, c)], { value: totalOf(c) - 1n }),
      vault,
      "WrongPayment",
    );
  });

  it("reverts CreatorMismatch when a token is sold under a different creator", async () => {
    const { vault, asBuyer } = await deploy();
    const first = await checkout();
    await asBuyer.write.purchase([first, await sign(vault.address, first)], { value: totalOf(first) });

    const hijack = await checkout({ lines: [line({ creator: creatorB.account.address })] });
    await viem.assertions.revertWithCustomErrorWithArgs(
      asBuyer.write.purchase([hijack, await sign(vault.address, hijack)], { value: totalOf(hijack) }),
      vault,
      "CreatorMismatch",
      [1n],
    );
  });

  it("reverts EmptyCheckout for a checkout without lines", async () => {
    const { vault, asBuyer } = await deploy();
    const c = await checkout({ lines: [] });
    await viem.assertions.revertWithCustomError(
      asBuyer.write.purchase([c, await sign(vault.address, c)], { value: 0n }),
      vault,
      "EmptyCheckout",
    );
  });

  it("blocks purchases while paused", async () => {
    const { vault, asBuyer } = await deploy();
    await vault.write.pause();
    const c = await checkout();
    await viem.assertions.revertWithCustomError(
      asBuyer.write.purchase([c, await sign(vault.address, c)], { value: totalOf(c) }),
      vault,
      "EnforcedPause",
    );
  });

  it("restricts admin functions and validates fee and signer rotation", async () => {
    const { vault, asStranger, asBuyer } = await deploy();
    await viem.assertions.revertWithCustomError(asStranger.write.setFeeBps([100]), vault, "OwnableUnauthorizedAccount");
    await viem.assertions.revertWithCustomError(vault.write.setFeeBps([1001]), vault, "FeeTooHigh");

    await vault.write.setPlatformSigner([stranger.account.address]);
    const c = await checkout();
    await viem.assertions.revertWithCustomError(
      asBuyer.write.purchase([c, await sign(vault.address, c, platform)], { value: totalOf(c) }),
      vault,
      "InvalidSignature",
    );
  });

  it("serves ERC-1155 {id} metadata URIs", async () => {
    const { vault } = await deploy();
    assert.equal(await vault.read.uri([1n]), "https://media.example/metadata/{id}.json");
  });

  it("fixes the edition size at the first sale so later checkouts cannot raise it", async () => {
    const { vault, asBuyer } = await deploy();
    const first = await checkout({ lines: [line({ quantity: 1n, maxSupply: 2n })] });
    await asBuyer.write.purchase([first, await sign(vault.address, first)], { value: totalOf(first) });
    assert.equal(await vault.read.maxSupplyOf([1n]), 2n);

    const inflated = await checkout({ lines: [line({ quantity: 2n, maxSupply: 100n })] });
    await viem.assertions.revertWithCustomErrorWithArgs(
      asBuyer.write.purchase([inflated, await sign(vault.address, inflated)], { value: totalOf(inflated) }),
      vault,
      "SoldOut",
      [1n],
    );
  });

  it("rejects zero-quantity and zero-creator lines", async () => {
    const { vault, asBuyer } = await deploy();
    for (const bad of [line({ quantity: 0n }), line({ creator: zeroAddress })]) {
      const c = await checkout({ lines: [bad] });
      await viem.assertions.revertWithCustomErrorWithArgs(
        asBuyer.write.purchase([c, await sign(vault.address, c)], { value: totalOf(c) }),
        vault,
        "InvalidLine",
        [1n],
      );
    }
  });

  it("sells exactly up to the cap in a transaction mined at the deadline second", async () => {
    const { vault, asBuyer } = await deploy();
    const c = await checkout({ lines: [line({ quantity: 5n, maxSupply: 5n })] });
    const sig = await sign(vault.address, c);
    await networkHelpers.time.setNextBlockTimestamp(c.deadline);
    await asBuyer.write.purchase([c, sig], { value: totalOf(c) });
    assert.equal(await vault.read.minted([1n]), 5n);
  });

  it("counts duplicate tokenIds in one cart cumulatively", async () => {
    const { vault, asBuyer } = await deploy();
    const c = await checkout({ lines: [line({ quantity: 3n }), line({ quantity: 3n })] });
    await viem.assertions.revertWithCustomErrorWithArgs(
      asBuyer.write.purchase([c, await sign(vault.address, c)], { value: totalOf(c) }),
      vault,
      "SoldOut",
      [1n],
    );
  });

  it("reverts PayoutFailed when a creator refuses ETH", async () => {
    const { vault, asBuyer } = await deploy();
    const rejecter = await viem.deployContract("EtherRejecter");
    const c = await checkout({ lines: [line({ creator: rejecter.address })] });
    await viem.assertions.revertWithCustomError(
      asBuyer.write.purchase([c, await sign(vault.address, c)], { value: totalOf(c) }),
      vault,
      "PayoutFailed",
    );
  });

  it("emits a TransferSingle mint per line for the indexer", async () => {
    const { vault, asBuyer } = await deploy();
    const c = await checkout({ lines: [line({ quantity: 2n })] });
    const hash = await asBuyer.write.purchase([c, await sign(vault.address, c)], { value: totalOf(c) });
    const buyerAddress = getAddress(buyer.account.address);
    await viem.assertions.emitWithArgs(hash, vault, "TransferSingle", [buyerAddress, zeroAddress, buyerAddress, 1n, 2n]);
  });

  it("accepts checkouts signed by a rotated platform signer", async () => {
    const { vault, asBuyer } = await deploy();
    await vault.write.setPlatformSigner([stranger.account.address]);
    const c = await checkout();
    await asBuyer.write.purchase([c, await sign(vault.address, c, stranger)], { value: totalOf(c) });
    assert.equal(await vault.read.balanceOf([buyer.account.address, 1n]), 1n);
  });

  it("floors the fee per line when the price does not divide evenly", async () => {
    const { vault, asBuyer } = await deploy();
    const c = await checkout({ lines: [line({ tokenId: 1n, unitPrice: 999n }), line({ tokenId: 2n, unitPrice: 999n })] });
    const hash = await asBuyer.write.purchase([c, await sign(vault.address, c)], { value: totalOf(c) });
    // 999 * 250 / 10_000 = 24.975 -> 24 wei fee per line, creator keeps 975 per line.
    await viem.assertions.balancesHaveChanged(hash, [
      { address: creatorA.account.address, amount: 2n * 975n },
      { address: treasury.account.address, amount: 48n },
    ]);
    await viem.assertions.emitWithArgs(hash, vault, "Purchased", [c.orderId, getAddress(buyer.account.address), 1998n, 48n]);
  });
});
