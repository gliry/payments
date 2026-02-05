import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'alice@example.com' })
  @IsString()
  username: string;

  @ApiProperty({
    example: 'cred_abc123',
    description: 'WebAuthn credential ID from Passkey registration',
  })
  @IsString()
  credentialId: string;

  @ApiProperty({
    example: '0x04abc...def',
    description: 'WebAuthn public key (hex) from Passkey registration',
  })
  @IsString()
  publicKey: string;
}
