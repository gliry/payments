import { IsString, IsOptional } from 'class-validator';
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

  @ApiProperty({ example: 'base', required: false })
  @IsOptional()
  @IsString()
  sourceChain?: string;
}
