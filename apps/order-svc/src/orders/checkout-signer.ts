import { Injectable } from "@nestjs/common";
import { InjectConfig } from "@lootvault/nest-common";
import { type CheckoutMessage, checkoutTypedData } from "@lootvault/shared";
import type { Hex } from "viem";
import { type PrivateKeyAccount, privateKeyToAccount } from "viem/accounts";

import type { OrderConfig } from "../config";

/** The platform key that authorises checkouts on-chain. (Production: an AWS KMS secp256k1 key.) */
@Injectable()
export class CheckoutSigner {
  private readonly account: PrivateKeyAccount;

  constructor(@InjectConfig() private readonly config: OrderConfig) {
    this.account = privateKeyToAccount(config.PLATFORM_SIGNER_KEY);
  }

  get address(): `0x${string}` {
    return this.account.address;
  }

  sign(message: CheckoutMessage): Promise<Hex> {
    return this.account.signTypedData(checkoutTypedData(this.config.CHAIN_ID, this.config.CONTRACT_ADDRESS, message));
  }
}
