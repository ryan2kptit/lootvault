import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { InjectModel } from "@nestjs/mongoose";
import { AppError, InjectConfig } from "@lootvault/nest-common";
import type { Model } from "mongoose";
import { isAddressEqual, recoverMessageAddress, type Hex } from "viem";
import { generateSiweNonce, parseSiweMessage, validateSiweMessage } from "viem/siwe";

import type { AuthSvcConfig } from "./config";
import { Nonce } from "./nonce.schema";
import { User } from "./user.schema";

const unauthorized = (code: string, message: string) => new AppError(code, 401, message);

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(Nonce.name) private readonly nonces: Model<Nonce>,
    private readonly jwt: JwtService,
    @InjectConfig() private readonly config: AuthSvcConfig,
  ) {}

  async issueNonce(address: string): Promise<{ nonce: string; expiresAt: string }> {
    const nonce = generateSiweNonce();
    const expiresAt = new Date(Date.now() + this.config.NONCE_TTL_SECONDS * 1000);
    await this.nonces.create({ _id: nonce, address: address.toLowerCase(), expiresAt });
    return { nonce, expiresAt: expiresAt.toISOString() };
  }

  async verify(message: string, signature: Hex): Promise<{ accessToken: string; address: string; expiresAt: string }> {
    const parsed = parseSiweMessage(message);
    if (!parsed.address || !parsed.nonce || !parsed.domain || parsed.chainId === undefined) {
      throw unauthorized("SIWE_MALFORMED", "Not a valid Sign-In with Ethereum message");
    }
    if (!this.config.SIWE_ALLOWED_DOMAINS.includes(parsed.domain)) {
      throw unauthorized("SIWE_DOMAIN_NOT_ALLOWED", `Domain ${parsed.domain} is not allowed`);
    }
    if (parsed.chainId !== this.config.CHAIN_ID) {
      throw unauthorized("SIWE_WRONG_CHAIN", `Expected chain ${this.config.CHAIN_ID}`);
    }
    if (!validateSiweMessage({ message: parsed })) {
      throw unauthorized("SIWE_EXPIRED", "Message is expired or not yet valid");
    }
    const signer = await recoverMessageAddress({ message, signature }).catch(() => undefined);
    if (!signer || !isAddressEqual(signer, parsed.address)) {
      throw unauthorized("SIWE_BAD_SIGNATURE", "Signature does not match the message address");
    }

    // Consume the nonce atomically: a replayed message finds nothing to delete.
    const address = parsed.address.toLowerCase();
    const consumed = await this.nonces.findOneAndDelete({ _id: parsed.nonce, address, expiresAt: { $gt: new Date() } });
    if (!consumed) throw unauthorized("NONCE_INVALID", "Nonce is unknown, expired or already used");

    await this.users.updateOne({ _id: address }, { $set: { lastLoginAt: new Date() } }, { upsert: true });
    const accessToken = await this.jwt.signAsync({ sub: address });
    const expiresAt = new Date(Date.now() + this.config.JWT_TTL_SECONDS * 1000).toISOString();
    return { accessToken, address, expiresAt };
  }

  async me(address: string): Promise<{ address: string; createdAt: Date; lastLoginAt: Date }> {
    const user = await this.users.findById(address).lean();
    if (!user) throw new AppError("USER_NOT_FOUND", 404, "User not found");
    return { address: user._id, createdAt: user.createdAt, lastLoginAt: user.lastLoginAt };
  }
}
