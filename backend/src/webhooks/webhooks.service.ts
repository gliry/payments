import {
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { randomBytes, createHmac } from 'crypto';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateWebhookDto } from './dto/create-webhook.dto';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateWebhookDto) {
    const secret = dto.secret || randomBytes(32).toString('hex');
    const events = dto.events || ['*'];

    const webhook = await this.prisma.webhook.create({
      data: {
        userId,
        url: dto.url,
        events: JSON.stringify(events),
        secret,
      },
    });

    return {
      id: webhook.id,
      url: webhook.url,
      events,
      secret,
      active: webhook.isActive,
      createdAt: webhook.createdAt,
    };
  }

  async list(userId: string) {
    const webhooks = await this.prisma.webhook.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        url: true,
        events: true,
        isActive: true,
        createdAt: true,
      },
    });

    return {
      webhooks: webhooks.map((w) => ({
        ...w,
        events: JSON.parse(w.events) as string[],
        active: w.isActive,
      })),
    };
  }

  async remove(userId: string, webhookId: string) {
    const webhook = await this.prisma.webhook.findFirst({
      where: { id: webhookId, userId },
    });

    if (!webhook) throw new NotFoundException('Webhook not found');

    await this.prisma.webhook.delete({ where: { id: webhookId } });
    return { deleted: true };
  }

  async dispatch(userId: string, event: string, payload: any) {
    const webhooks = await this.prisma.webhook.findMany({
      where: {
        userId,
        isActive: true,
      },
    });

    for (const webhook of webhooks) {
      const events = JSON.parse(webhook.events) as string[];
      if (!events.includes('*') && !events.includes(event)) {
        continue;
      }

      const body = JSON.stringify({ event, data: payload, timestamp: new Date().toISOString() });
      const signature = createHmac('sha256', webhook.secret)
        .update(body)
        .digest('hex');

      const delivery = await this.prisma.webhookDelivery.create({
        data: {
          webhookId: webhook.id,
          eventType: event,
          payload,
        },
      });

      this.sendWebhook(webhook.url, body, signature, delivery.id).catch(
        (err) => this.logger.error(`Webhook delivery failed: ${err.message}`),
      );
    }
  }

  private async sendWebhook(
    url: string,
    body: string,
    signature: string,
    deliveryId: string,
  ) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
        },
        body,
        signal: AbortSignal.timeout(10_000),
      });

      await this.prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: {
          delivered: response.ok,
          httpStatus: response.status,
          attempts: { increment: 1 },
          lastAttemptAt: new Date(),
          deliveredAt: response.ok ? new Date() : undefined,
        },
      });
    } catch (error) {
      await this.prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: {
          delivered: false,
          httpStatus: 0,
          response: error.message,
          attempts: { increment: 1 },
          lastAttemptAt: new Date(),
        },
      });
    }
  }
}
