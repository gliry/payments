import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsObject } from 'class-validator';

export class CreateTransferDto {
  @ApiProperty({ example: 'acc_123' })
  @IsString()
  fromAccountId: string;

  @ApiProperty({
    example: 'user@example.com',
    description: 'Email, account ID, or ENS name',
  })
  @IsString()
  to: string;

  @ApiProperty({ example: '100.00' })
  @IsString()
  amount: string;

  @ApiProperty({ example: 'USDC', default: 'USDC', required: false })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}
