import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, IsObject } from 'class-validator';

export class CreateAccountDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'external_user_123', required: false })
  @IsOptional()
  @IsString()
  externalId?: string;

  @ApiProperty({ example: { company: 'Acme Inc' }, required: false })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}
