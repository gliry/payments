import { IsArray, IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PrepareCollectDto {
  @ApiProperty({ example: ['arbitrum', 'avalanche'] })
  @IsArray()
  @IsString({ each: true })
  sourceChains: string[];

  @ApiProperty({ example: 'polygon', required: false })
  @IsOptional()
  @IsString()
  destination?: string;
}
