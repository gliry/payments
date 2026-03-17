import { IsString, IsObject, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PrepareEnableExecutorDto {
  @ApiProperty({ example: 'polygon' })
  @IsString()
  chain: string;
}

export class SubmitEnableExecutorDto {
  @ApiProperty({ example: 'polygon' })
  @IsString()
  chain: string;

  @ApiProperty({ description: 'Passkey signature of the EIP-712 enable hash' })
  @IsString()
  enableSignature: string;

  @ApiProperty({
    description: 'WebAuthn assertion metadata for enable signature',
    required: false,
  })
  @IsObject()
  @IsOptional()
  webauthn?: {
    authenticatorData: string;
    clientDataJSON: string;
    challengeIndex: number;
    typeIndex: number;
  };

  @ApiProperty({
    description: 'Request ID from prepare step (when needsUninstall=true)',
    required: false,
  })
  @IsString()
  @IsOptional()
  uninstallRequestId?: string;

  @ApiProperty({
    description: 'Passkey signature of the uninstall UserOp hash',
    required: false,
  })
  @IsString()
  @IsOptional()
  uninstallSignature?: string;

  @ApiProperty({
    description: 'WebAuthn assertion metadata for uninstall signature',
    required: false,
  })
  @IsObject()
  @IsOptional()
  uninstallWebauthn?: {
    authenticatorData: string;
    clientDataJSON: string;
    challengeIndex: number;
    typeIndex: number;
  };
}
