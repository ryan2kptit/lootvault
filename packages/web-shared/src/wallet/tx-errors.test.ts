import { lootVault1155Abi } from "@lootvault/shared";
import {
  BaseError,
  ContractFunctionExecutionError,
  ContractFunctionRevertedError,
  encodeErrorResult,
  type Hex,
  UserRejectedRequestError,
  zeroAddress,
} from "viem";
import { describe, expect, it } from "vitest";

import { ApiError } from "../api/errors";
import { describeTxError, errorMessage } from "./tx-errors";

/** The shape viem/wagmi throw when simulating or sending `purchase` fails. */
function purchaseFailure(cause: BaseError) {
  return new ContractFunctionExecutionError(cause, { abi: lootVault1155Abi, functionName: "purchase", contractAddress: zeroAddress, args: [] });
}

function revert(data: Hex) {
  return purchaseFailure(new ContractFunctionRevertedError({ abi: lootVault1155Abi, data, functionName: "purchase" }));
}

const soldOut = revert(encodeErrorResult({ abi: lootVault1155Abi, errorName: "SoldOut", args: [1n] }));
const expired = revert(encodeErrorResult({ abi: lootVault1155Abi, errorName: "Expired" }));

describe("describeTxError", () => {
  it("decodes SoldOut from the contract ABI", () => {
    expect(describeTxError(soldOut)).toEqual({
      code: "SoldOut",
      message: "Just sold out. The quantity has been updated to what is left.",
    });
  });

  it("decodes Expired", () => {
    expect(describeTxError(expired)).toEqual({ code: "Expired", message: "The checkout session expired. Please try again." });
  });

  it.each(["WrongPayment", "EnforcedPause", "WrongBuyer", "InvalidSignature"] as const)("decodes %s", (errorName) => {
    expect(describeTxError(revert(encodeErrorResult({ abi: lootVault1155Abi, errorName }))).code).toBe(errorName);
  });

  it("recognises a rejection in the wallet", () => {
    const error = purchaseFailure(new UserRejectedRequestError(new Error("User denied transaction signature.")));
    expect(describeTxError(error)).toEqual({ code: "UserRejected", message: "You cancelled the request in your wallet." });
  });

  it("falls back to viem's short message, or the plain message", () => {
    const unknown = purchaseFailure(new BaseError("boom"));
    expect(describeTxError(unknown)).toEqual({ code: "Unknown", message: unknown.shortMessage });
    expect(describeTxError(new Error("plain"))).toEqual({ code: "Unknown", message: "plain" });
  });
});

describe("errorMessage", () => {
  it("uses the ApiError message for backend errors and the decoded revert otherwise", () => {
    expect(errorMessage(new ApiError(409, "SLUG_TAKEN", "taken"))).toBe("taken");
    expect(errorMessage(expired)).toBe("The checkout session expired. Please try again.");
  });
});
