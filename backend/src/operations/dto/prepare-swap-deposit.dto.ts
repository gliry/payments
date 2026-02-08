import { IsString, IsOptional, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PrepareSwapDepositDto {
  @ApiProperty({ example: 'base', description: 'Source chain key' })
  @IsString()
  sourceChain: string;

  @ApiProperty({
    example: '0x4200000000000000000000000000000000000006',
    description: 'Source token contract address',
  })
  @IsString()
  sourceToken: string;

  @ApiProperty({ example: '0.5', description: 'Amount in source token units' })
  @IsString()
  amount: string;

  @ApiProperty({ example: 18, required: false, description: 'Source token decimals (default: 18)' })
  @IsOptional()
  @IsNumber()
  tokenDecimals?: number;

  @ApiProperty({ example: 0.005, required: false, description: 'Max slippage (default: 0.005 = 0.5%)' })
  @IsOptional()
  @IsNumber()
  slippage?: number;
}
