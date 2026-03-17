import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { WalletService } from './wallet.service';
import { PrepareDelegateDto } from './dto/prepare-delegate.dto';
import { SubmitDelegateDto } from './dto/submit-delegate.dto';
import { PrepareUserOpDto } from './dto/prepare-userop.dto';
import { SubmitUserOpDto } from './dto/submit-userop.dto';
import { PrepareEnableExecutorDto, SubmitEnableExecutorDto } from './dto/enable-executor.dto';
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
  @ApiOperation({ summary: 'Get wallet info (address, delegate, supported chains, delegate statuses)' })
  getWalletInfo(@CurrentUser() user: JwtUser) {
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

  @Get('executor-status')
  @ApiOperation({ summary: 'Check ECDSA validator installation status on all chains' })
  getExecutorStatus(@CurrentUser() user: JwtUser) {
    return this.walletService.getExecutorStatus(user.id);
  }

  @Post('enable-executor')
  @ApiOperation({ summary: 'Prepare ECDSA validator enable (returns EIP-712 hash for passkey signing)' })
  prepareEnableExecutor(
    @CurrentUser() user: JwtUser,
    @Body() dto: PrepareEnableExecutorDto,
  ) {
    return this.walletService.prepareEnableExecutor(user.id, dto);
  }

  @Post('enable-executor/submit')
  @ApiOperation({ summary: 'Submit ECDSA validator enable with passkey signature' })
  submitEnableExecutor(
    @CurrentUser() user: JwtUser,
    @Body() dto: SubmitEnableExecutorDto,
  ) {
    return this.walletService.submitEnableExecutor(user.id, dto);
  }

  @Post('setup-settlement')
  @ApiOperation({ summary: 'Prepare combined settlement setup: ECDSA enable + delegate in one UserOp (1 passkey signature)' })
  prepareSetupSettlement(
    @CurrentUser() user: JwtUser,
    @Body() dto: PrepareEnableExecutorDto,
  ) {
    return this.walletService.prepareSetupSettlement(user.id, dto);
  }

  @Post('setup-settlement/submit')
  @ApiOperation({ summary: 'Submit combined settlement setup with passkey signature' })
  submitSetupSettlement(
    @CurrentUser() user: JwtUser,
    @Body() dto: SubmitEnableExecutorDto,
  ) {
    return this.walletService.submitSetupSettlement(user.id, dto);
  }

  @Post('userop/prepare')
  @ApiOperation({ summary: 'Prepare a UserOp from arbitrary calls (returns userOpHash for signing)' })
  prepareUserOp(
    @CurrentUser() user: JwtUser,
    @Body() dto: PrepareUserOpDto,
  ) {
    return this.walletService.prepareGenericUserOp(user.id, dto);
  }

  @Post('userop/submit')
  @ApiOperation({ summary: 'Submit a signed UserOp (returns on-chain txHash)' })
  submitUserOp(
    @CurrentUser() user: JwtUser,
    @Body() dto: SubmitUserOpDto,
  ) {
    return this.walletService.submitGenericUserOp(user.id, dto);
  }
}
