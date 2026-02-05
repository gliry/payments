import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'alice@example.com' })
  @IsString()
  username: string;

  @ApiProperty({ example: 'cred_abc123' })
  @IsString()
  credentialId: string;
}
