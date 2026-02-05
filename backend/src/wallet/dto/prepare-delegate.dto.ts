import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PrepareDelegateDto {
  @ApiProperty({ example: 'base-sepolia' })
  @IsString()
  chain: string;
}
