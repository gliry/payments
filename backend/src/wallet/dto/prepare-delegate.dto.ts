import { ApiProperty } from '@nestjs/swagger';
import { IsGatewayChain } from '../../common/validators/chain.validator';

export class PrepareDelegateDto {
  @ApiProperty({ example: 'polygon' })
  @IsGatewayChain()
  chain: string;
}
