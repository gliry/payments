import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { WebhooksService } from './webhooks.service';
import { CreateWebhookDto } from './dto/create-webhook.dto';
import {
  AuthGuard,
  CurrentUser,
  JwtUser,
} from '../common/guards/auth.guard';

@ApiTags('webhooks')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post()
  @ApiOperation({ summary: 'Register a webhook endpoint' })
  create(
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateWebhookDto,
  ) {
    return this.webhooksService.create(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all webhooks' })
  list(@CurrentUser() user: JwtUser) {
    return this.webhooksService.list(user.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a webhook' })
  remove(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
  ) {
    return this.webhooksService.remove(user.id, id);
  }
}
