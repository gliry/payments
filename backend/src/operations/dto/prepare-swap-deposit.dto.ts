import { IsOptional, IsNumber, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsChain, IsEvmAddress, IsTokenAmount } from '../../common/validators/chain.validator';

export class PrepareSwapDepositDto {
  @ApiProperty({ example: 'base', description: 'Source chain key' })
  @IsChain()
  sourceChain: string;

  @ApiProperty({
    example: '0x4200000000000000000000000000000000000006',
    description: 'Source token contract address',
  })
  @IsEvmAddress()
  sourceToken: string;

  @ApiProperty({ example: '0.5', description: 'Amount in source token units' })
  @IsTokenAmount()
  amount: string;

  @ApiProperty({ example: 18, required: false, description: 'Source token decimals (default: 18)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(18)
  tokenDecimals?: number;

  @ApiProperty({ example: 0.005, required: false, description: 'Max slippage (default: 0.005 = 0.5%)' })
  @IsOptional()
  @IsNumber()
  @Min(0.001)
  @Max(0.5)
  slippage?: number;
}
