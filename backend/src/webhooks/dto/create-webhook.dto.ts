import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsArray, IsUrl } from 'class-validator';

export class CreateWebhookDto {
  @ApiProperty({ example: 'https://example.com/webhooks/omniflow' })
  @IsUrl()
  url: string;

  @ApiProperty({
    example: ['deposit.completed', 'payout.completed', 'payout.failed'],
  })
  @IsArray()
  @IsString({ each: true })
  events: string[];
}
