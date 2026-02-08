import { IsString, IsOptional, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PrepareSendDto {
  @ApiProperty({ example: '0x1234...' })
  @IsString()
  destinationAddress: string;

  @ApiProperty({ example: 'arbitrum' })
  @IsString()
  destinationChain: string;

  @ApiProperty({ example: '100.00' })
  @IsString()
  amount: string;

  @ApiProperty({ example: 'polygon', required: false })
  @IsOptional()
  @IsString()
  sourceChain?: string;

  @ApiProperty({
    example: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    required: false,
    description: 'Output token address for LiFi swap (if omitted, sends USDC)',
  })
  @IsOptional()
  @IsString()
  outputToken?: string;

  @ApiProperty({ example: 18, required: false, description: 'Output token decimals (default: 18)' })
  @IsOptional()
  @IsNumber()
  outputTokenDecimals?: number;

  @ApiProperty({ example: 0.005, required: false, description: 'Max slippage for swap (default: 0.005)' })
  @IsOptional()
  @IsNumber()
  slippage?: number;
}
