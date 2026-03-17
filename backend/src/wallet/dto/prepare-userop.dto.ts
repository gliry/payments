import { IsArray, IsString, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class CallDto {
  @ApiProperty({ example: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359' })
  @IsString()
  to: string;

  @ApiProperty({ example: '0x095ea7b3...' })
  @IsString()
  data: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  value?: string;
}

export class PrepareUserOpDto {
  @ApiProperty({ example: 'polygon' })
  @IsString()
  chain: string;

  @ApiProperty({ type: [CallDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CallDto)
  calls: CallDto[];
}
