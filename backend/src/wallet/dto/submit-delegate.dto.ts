import { IsString, IsObject, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsGatewayChain } from '../../common/validators/chain.validator';

export class SubmitDelegateDto {
  @ApiProperty({ example: 'polygon' })
  @IsGatewayChain()
  chain: string;

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
