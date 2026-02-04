import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateWebhookDto } from './dto/create-webhook.dto';
import { randomBytes } from 'crypto';

@Injectable()
export class WebhooksService {
  constructor(private prisma: PrismaService) {}

  async create(createWebhookDto: CreateWebhookDto) {
    // Generate webhook secret for signature verification
    const secret = 'whsec_' + randomBytes(32).toString('hex');

    const webhook = await this.prisma.webhook.create({
      data: {
        url: createWebhookDto.url,
        events: JSON.stringify(createWebhookDto.events),
        secret,
        isActive: true,
      },
    });

    return {
      id: webhook.id,
      url: webhook.url,
      events: JSON.parse(webhook.events),
      secret: webhook.secret,
      isActive: webhook.isActive,
      createdAt: webhook.createdAt,
    };
  }

  async findAll() {
    const webhooks = await this.prisma.webhook.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return {
      data: webhooks.map((w) => ({
        ...w,
        events: JSON.parse(w.events),
      })),
      count: webhooks.length,
    };
  }

  async findOne(id: string) {
    const webhook = await this.prisma.webhook.findUnique({
      where: { id },
    });

    if (!webhook) {
      throw new NotFoundException(`Webhook with ID ${id} not found`);
    }

    return {
      ...webhook,
      events: JSON.parse(webhook.events),
    };
  }

  async remove(id: string) {
    const webhook = await this.prisma.webhook.delete({
      where: { id },
    });

    return {
      message: 'Webhook deleted successfully',
      id: webhook.id,
    };
  }
}
