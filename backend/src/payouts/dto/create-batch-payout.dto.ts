import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsArray, IsOptional, IsObject, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CreatePayoutDto } from './create-payout.dto';

class BatchPayoutItemDto {
  @ApiProperty({ example: '100.00' })
  @IsString()
  amount: string;

  @ApiProperty({
    example: {
      address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
      chain: 'base-sepolia',
    },
  })
  @IsObject()
  destination: {
    address: string;
    chain: string;
    token?: string;
  };
}

export class CreateBatchPayoutDto {
  @ApiProperty({ example: 'acc_123' })
  @IsString()
  accountId: string;

  @ApiProperty({ type: [BatchPayoutItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BatchPayoutItemDto)
  payouts: BatchPayoutItemDto[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}
