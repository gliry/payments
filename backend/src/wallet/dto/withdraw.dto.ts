import { IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class WithdrawDto {
  @ApiProperty({ example: 'polygon', description: 'Chain to mint USDC on' })
  @IsString()
  chain: string;

  @ApiProperty({
    example: '1.0',
    required: false,
    description: 'Amount in USDC (defaults to full Gateway balance on source chain)',
  })
  @IsOptional()
  @IsString()
  amount?: string;

  @ApiProperty({
    example: 'avalanche',
    required: false,
    description: 'Source chain to burn from (defaults to chain with highest Gateway balance)',
  })
  @IsOptional()
  @IsString()
  sourceChain?: string;
}
