import { IsArray, IsOptional, IsNumber, ValidateNested, ArrayMinSize, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { IsChain, IsEvmAddress, IsTokenAmount } from '../../common/validators/chain.validator';

export class SendRecipient {
  @ApiProperty({ example: '0x1234...', required: false, description: 'Recipient address (omit for bridge to self)' })
  @IsOptional()
  @IsEvmAddress()
  address?: string;

  @ApiProperty({ example: 'arbitrum' })
  @IsChain()
  chain: string;

  @ApiProperty({ example: '100.00' })
  @IsTokenAmount()
  amount: string;

  @ApiProperty({
    example: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    required: false,
    description: 'Output token address for LiFi swap (if omitted, sends USDC)',
  })
  @IsOptional()
  @IsEvmAddress()
  outputToken?: string;

  @ApiProperty({ example: 18, required: false, description: 'Output token decimals (default: 18)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(18)
  outputTokenDecimals?: number;

  @ApiProperty({ example: 0.005, required: false, description: 'Max slippage for swap (default: auto)' })
  @IsOptional()
  @IsNumber()
  @Min(0.001)
  @Max(0.5)
  slippage?: number;
}

export class PrepareSendDto {
  @ApiProperty({
    type: [SendRecipient],
    description: 'One or more recipients. Single = send/bridge. Multiple = batch send.',
    example: [
      { address: '0xAAA...', chain: 'arbitrum', amount: '50.00' },
      { address: '0xBBB...', chain: 'polygon', amount: '100.00' },
    ],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SendRecipient)
  recipients: SendRecipient[];

  @ApiProperty({ example: 'polygon', required: false, description: 'Source chain (default: hub chain)' })
  @IsOptional()
  @IsChain()
  sourceChain?: string;
}
