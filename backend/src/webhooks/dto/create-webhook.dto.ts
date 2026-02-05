import { IsString, IsUrl, IsArray, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateWebhookDto {
  @ApiProperty({ example: 'https://example.com/webhooks' })
  @IsUrl()
  url: string;

  @ApiProperty({
    example: ['operation.completed', 'operation.failed'],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  events?: string[];

  @ApiProperty({ example: 'my-secret-key', required: false })
  @IsOptional()
  @IsString()
  secret?: string;
}
