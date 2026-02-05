import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PrepareBridgeDto {
  @ApiProperty({ example: 'arbitrum' })
  @IsString()
  sourceChain: string;

  @ApiProperty({ example: 'base' })
  @IsString()
  destinationChain: string;

  @ApiProperty({ example: '50.00' })
  @IsString()
  amount: string;
}
