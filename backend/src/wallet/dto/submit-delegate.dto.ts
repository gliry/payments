import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SubmitDelegateDto {
  @ApiProperty({ example: 'base' })
  @IsString()
  chain: string;

  @ApiProperty({ example: '0xabc123...' })
  @IsString()
  txHash: string;
}
