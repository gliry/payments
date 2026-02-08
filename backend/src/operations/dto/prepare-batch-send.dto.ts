import { IsArray, IsString, IsOptional, IsNumber, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class BatchRecipient {
  @ApiProperty({ example: '0x1234...' })
  @IsString()
  address: string;

  @ApiProperty({ example: 'arbitrum' })
  @IsString()
  chain: string;

  @ApiProperty({ example: '50.00' })
  @IsString()
  amount: string;

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

  @ApiProperty({ example: 0.005, required: false, description: 'Max slippage for swap (default: auto)' })
  @IsOptional()
  @IsNumber()
  slippage?: number;
}

export class PrepareBatchSendDto {
  @ApiProperty({
    type: [BatchRecipient],
    example: [
      { address: '0xAAA...', chain: 'arbitrum', amount: '50.00' },
      { address: '0xBBB...', chain: 'polygon', amount: '100.00' },
    ],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BatchRecipient)
  recipients: BatchRecipient[];

  @ApiProperty({ example: 'polygon', required: false })
  @IsOptional()
  @IsString()
  sourceChain?: string;
}
