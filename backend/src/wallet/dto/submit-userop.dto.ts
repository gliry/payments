import { IsString, IsObject, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SubmitUserOpDto {
  @ApiProperty({ description: 'Prepare request ID returned by POST /v1/wallet/userop/prepare' })
  @IsString()
  requestId: string;

  @ApiProperty({ example: '0xabc123...' })
  @IsString()
  signature: string;

  @ApiProperty({
    description: 'WebAuthn assertion metadata for Kernel passkey validator encoding',
    required: false,
  })
  @IsObject()
  @IsOptional()
  webauthn?: {
    authenticatorData: string;
    clientDataJSON: string;
    challengeIndex: number;
    typeIndex: number;
    userVerificationRequired: boolean;
  };
}
