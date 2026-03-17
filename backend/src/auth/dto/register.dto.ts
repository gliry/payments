import { IsString, IsObject, ValidateNested, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class WebAuthnCredentialDto {
  @ApiProperty({ example: 'cred_abc123' })
  @IsString()
  id: string;

  @ApiProperty()
  @IsString()
  rawId: string;

  @ApiProperty()
  @IsObject()
  response: Record<string, any>;

  @ApiProperty({ example: 'public-key' })
  @IsString()
  type: string;

  @ApiProperty({ required: false })
  @IsOptional()
  authenticatorAttachment?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  clientExtensionResults?: Record<string, any>;
}

export class RegisterDto {
  @ApiProperty({ example: 'alice@example.com' })
  @IsString()
  username: string;

  @ApiProperty({ description: 'WebAuthn credential from navigator.credentials.create()' })
  @ValidateNested()
  @Type(() => WebAuthnCredentialDto)
  credential: WebAuthnCredentialDto;

  @ApiProperty({
    example: '0x04abc...def',
    description: 'WebAuthn public key (hex) from Passkey registration',
  })
  @IsString()
  publicKey: string;
}
