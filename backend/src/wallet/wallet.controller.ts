import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { WalletService } from './wallet.service';
import { PrepareDelegateDto } from './dto/prepare-delegate.dto';
import { SubmitDelegateDto } from './dto/submit-delegate.dto';
import {
  AuthGuard,
  CurrentUser,
  JwtUser,
} from '../common/guards/auth.guard';

@ApiTags('wallet')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get('balances')
  @ApiOperation({ summary: 'Get aggregated balances across all chains + Gateway' })
  getBalances(@CurrentUser() user: JwtUser) {
    return this.walletService.getBalances(user.id);
  }

  @Post('delegate')
  @ApiOperation({ summary: 'Prepare addDelegate UserOp for signing' })
  prepareDelegate(
    @CurrentUser() user: JwtUser,
    @Body() dto: PrepareDelegateDto,
  ) {
    return this.walletService.prepareDelegate(user.id, dto);
  }

  @Post('delegate/submit')
  @ApiOperation({ summary: 'Confirm delegate setup with tx hash' })
  submitDelegate(
    @CurrentUser() user: JwtUser,
    @Body() dto: SubmitDelegateDto,
  ) {
    return this.walletService.submitDelegate(user.id, dto);
  }
}
