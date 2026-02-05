import { IsArray, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class SignatureEntry {
  @ApiProperty({ example: 'step_abc123' })
  @IsString()
  stepId: string;

  @ApiProperty({ example: '0xabc...' })
  @IsString()
  txHash: string;
}

export class SubmitOperationDto {
  @ApiProperty({ type: [SignatureEntry] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SignatureEntry)
  signatures: SignatureEntry[];
}
