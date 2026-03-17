import { IsArray, IsOptional, ArrayMinSize } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsGatewayChain } from '../../common/validators/chain.validator';

export class PrepareCollectDto {
  @ApiProperty({ example: ['arbitrum', 'avalanche'] })
  @IsArray()
  @ArrayMinSize(1)
  @IsGatewayChain({ each: true })
  sourceChains: string[];

  @ApiProperty({ example: 'polygon', required: false })
  @IsOptional()
  @IsGatewayChain()
  destination?: string;
}
