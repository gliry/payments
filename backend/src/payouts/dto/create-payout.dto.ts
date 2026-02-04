import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsObject, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class DestinationDto {
  @ApiProperty({ example: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb' })
  @IsString()
  address: string;

  @ApiProperty({ example: 'base-sepolia' })
  @IsString()
  chain: string;

  @ApiProperty({ example: 'USDC', required: false })
  @IsOptional()
  @IsString()
  token?: string;
}

export class CreatePayoutDto {
  @ApiProperty({ example: 'acc_123' })
  @IsString()
  accountId: string;

  @ApiProperty({ example: '100.00' })
  @IsString()
  amount: string;

  @ApiProperty({ example: 'USDC', default: 'USDC', required: false })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiProperty({ type: DestinationDto })
  @ValidateNested()
  @Type(() => DestinationDto)
  destination: DestinationDto;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}
