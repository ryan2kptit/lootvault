import { ApiProperty } from "@nestjs/swagger";
import { IsEthereumAddress, IsString, Matches, MaxLength } from "class-validator";

export class NonceQueryDto {
  @ApiProperty({ example: "0x90F79bf6EB2c4f870365E785982E1f101E93b906" })
  @IsEthereumAddress()
  address: string;
}

export class VerifyDto {
  @ApiProperty({ description: "EIP-4361 message exactly as signed" })
  @IsString()
  @MaxLength(4000)
  message: string;

  @ApiProperty({ example: "0x..." })
  @Matches(/^0x[0-9a-fA-F]+$/)
  signature: `0x${string}`;
}
