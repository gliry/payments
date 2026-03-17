import { IsString, IsOptional, IsBoolean } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class SubmitPaymentDto {
  @ApiPropertyOptional({ example: '0xabc...', description: 'On-chain tx hash from payer' })
  @IsString()
  @IsOptional()
  txHash?: string;

  @ApiPropertyOptional({ example: 'polygon', description: 'Chain payer sent from' })
  @IsString()
  @IsOptional()
  chain?: string;

  @ApiPropertyOptional({ example: '0x123...', description: 'Payer wallet address' })
  @IsString()
  @IsOptional()
  payerAddress?: string;

  @ApiPropertyOptional({ example: 'USDC', description: 'Token payer used (default: USDC)' })
  @IsString()
  @IsOptional()
  token?: string;

  @ApiPropertyOptional({ description: 'If true, pay from OmniFlow Gateway balance (requires JWT)' })
  @IsBoolean()
  @IsOptional()
  internal?: boolean;
}
