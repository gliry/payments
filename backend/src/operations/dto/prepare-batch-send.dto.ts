import { IsArray, IsString, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class BatchRecipient {
  @ApiProperty({ example: '0x1234...' })
  @IsString()
  address: string;

  @ApiProperty({ example: 'arbitrum' })
  @IsString()
  chain: string;

  @ApiProperty({ example: '50.00' })
  @IsString()
  amount: string;
}

export class PrepareBatchSendDto {
  @ApiProperty({
    type: [BatchRecipient],
    example: [
      { address: '0xAAA...', chain: 'arbitrum', amount: '50.00' },
      { address: '0xBBB...', chain: 'base', amount: '100.00' },
    ],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BatchRecipient)
  recipients: BatchRecipient[];

  @ApiProperty({ example: 'base', required: false })
  @IsOptional()
  @IsString()
  sourceChain?: string;
}
