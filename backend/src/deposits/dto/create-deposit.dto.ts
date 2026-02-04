import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsObject } from 'class-validator';

export class CreateDepositDto {
  @ApiProperty({ example: 'acc_123' })
  @IsString()
  accountId: string;

  @ApiProperty({ example: '1000.00', required: false })
  @IsOptional()
  @IsString()
  expectedAmount?: string;

  @ApiProperty({ example: 'base-sepolia' })
  @IsString()
  sourceChain: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}
