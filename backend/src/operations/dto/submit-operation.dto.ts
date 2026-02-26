import { IsArray, IsString, IsUUID, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class SignatureEntry {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @IsUUID()
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
