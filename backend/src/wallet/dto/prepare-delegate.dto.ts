import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PrepareDelegateDto {
  @ApiProperty({ example: 'polygon' })
  @IsString()
  chain: string;
}
