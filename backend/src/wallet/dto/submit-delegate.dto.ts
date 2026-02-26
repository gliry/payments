import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsGatewayChain } from '../../common/validators/chain.validator';

export class SubmitDelegateDto {
  @ApiProperty({ example: 'polygon' })
  @IsGatewayChain()
  chain: string;

  @ApiProperty({ example: '0xabc123...' })
  @IsString()
  txHash: string;
}
