import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtService } from '@nestjs/jwt';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { SubmitPaymentDto } from './dto/submit-payment.dto';
import {
  AuthGuard,
  CurrentUser,
  JwtUser,
} from '../common/guards/auth.guard';

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly jwtService: JwtService,
  ) {}

  @Post()
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Create a payment invoice' })
  create(@CurrentUser() user: JwtUser, @Body() dto: CreatePaymentDto) {
    return this.paymentsService.create(user.id, dto);
  }

  @Get()
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'List merchant payments' })
  list(
    @CurrentUser() user: JwtUser,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.paymentsService.list(user.id, {
      status,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get payment details (public — for checkout page)' })
  getById(@Param('id') id: string) {
    return this.paymentsService.getById(id);
  }

  @Post(':id/pay')
  @ApiOperation({ summary: 'Submit payment proof (txHash or internal)' })
  async submitPayment(
    @Param('id') id: string,
    @Body() dto: SubmitPaymentDto,
    @Req() req: Request,
  ) {
    // Optional auth — extract user if JWT present
    let payerUserId: string | undefined;
    const [type, token] = req.headers.authorization?.split(' ') ?? [];
    if (type === 'Bearer' && token) {
      try {
        const payload = await this.jwtService.verifyAsync(token);
        payerUserId = payload.sub;
      } catch {
        // Invalid token — ignore, proceed as external payer
      }
    }

    return this.paymentsService.submitPayment(id, dto, payerUserId);
  }

  @Post(':id/cancel')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Cancel a payment' })
  cancel(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.paymentsService.cancel(user.id, id);
  }
}
