import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PrepareBridgeDto {
  @ApiProperty({ example: 'base-sepolia' })
  @IsString()
  sourceChain: string;

  @ApiProperty({ example: 'arc-testnet' })
  @IsString()
  destinationChain: string;

  @ApiProperty({ example: '50.00' })
  @IsString()
  amount: string;
}
