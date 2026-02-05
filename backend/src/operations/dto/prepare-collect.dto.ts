import { IsArray, IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PrepareCollectDto {
  @ApiProperty({ example: ['base-sepolia', 'avalanche-fuji'] })
  @IsArray()
  @IsString({ each: true })
  sourceChains: string[];

  @ApiProperty({ example: 'arc-testnet', required: false })
  @IsOptional()
  @IsString()
  destination?: string;
}
