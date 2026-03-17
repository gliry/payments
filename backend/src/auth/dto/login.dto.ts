import { IsString, ValidateNested } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { WebAuthnCredentialDto } from './register.dto';

export class LoginDto {
  @ApiProperty({ example: 'alice@example.com' })
  @IsString()
  username: string;

  @ApiProperty({ description: 'WebAuthn credential from navigator.credentials.get()' })
  @ValidateNested()
  @Type(() => WebAuthnCredentialDto)
  credential: WebAuthnCredentialDto;
}
