import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { WalletService } from './wallet.service';
import { PrepareDelegateDto } from './dto/prepare-delegate.dto';
import { SubmitDelegateDto } from './dto/submit-delegate.dto';
import { WithdrawDto } from './dto/withdraw.dto';
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

  @Get()
  @ApiOperation({ summary: 'Get wallet info (address, chains, delegate status)' })
  getWallet(@CurrentUser() user: JwtUser) {
    return this.walletService.getWalletInfo(user.id);
  }

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

  @Post('withdraw')
  @ApiOperation({ summary: 'Withdraw USDC from Gateway to a specific chain' })
  withdraw(
    @CurrentUser() user: JwtUser,
    @Body() dto: WithdrawDto,
  ) {
    return this.walletService.withdraw(user.id, dto);
  }
}
