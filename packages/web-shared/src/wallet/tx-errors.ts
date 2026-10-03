import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError } from "viem";

import { ApiError } from "../api/errors";

/** LootVault1155 custom errors (ABI in @lootvault/shared) and what the buyer should read. */
const REVERT_MESSAGES = {
  SoldOut: "Just sold out. The quantity has been updated to what is left.",
  Expired: "The checkout session expired. Please try again.",
  InvalidLine: "This checkout contains an invalid item. Please refresh and try again.",
  PayoutFailed: "The seller's payout failed, so nothing was charged. Please try again later.",
  WrongPayment: "The payment amount does not match the order total.",
  OrderUsed: "This order has already been paid.",
  InvalidSignature: "The checkout signature is invalid. Please start the checkout again.",
  WrongBuyer: "This checkout belongs to a different wallet. Sign in with the wallet that created it.",
  CreatorMismatch: "An item's creator does not match the one on-chain.",
  EmptyCheckout: "The checkout has no items.",
  EnforcedPause: "Purchases are paused right now. Please try again later.",
} as const;

type RevertName = keyof typeof REVERT_MESSAGES;
const isKnownRevert = (name: string): name is RevertName => Object.hasOwn(REVERT_MESSAGES, name);

type TxErrorCode = RevertName | "UserRejected" | "Unknown";

interface TxError {
  code: TxErrorCode;
  message: string;
}

/** Turns a wallet or contract error from viem/wagmi into a code and a sentence for the user. */
export function describeTxError(error: unknown): TxError {
  if (!(error instanceof BaseError)) {
    return { code: "Unknown", message: error instanceof Error ? error.message : "The transaction failed." };
  }
  if (error.walk((cause) => cause instanceof UserRejectedRequestError)) {
    return { code: "UserRejected", message: "You cancelled the request in your wallet." };
  }
  const revert = error.walk((cause) => cause instanceof ContractFunctionRevertedError);
  if (revert instanceof ContractFunctionRevertedError) {
    const name = revert.data?.errorName;
    if (name && isKnownRevert(name)) return { code: name, message: REVERT_MESSAGES[name] };
  }
  return { code: "Unknown", message: error.shortMessage };
}

/** One readable sentence for any error the UI can meet: backend (ApiError) or wallet/contract (viem). */
export function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : describeTxError(error).message;
}
