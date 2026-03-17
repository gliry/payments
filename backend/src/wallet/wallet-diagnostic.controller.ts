import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { WalletService } from './wallet.service';
import { AuthGuard, CurrentUser, JwtUser } from '../common/guards/auth.guard';

@ApiTags('diagnostic')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('wallet')
export class WalletDiagnosticController {
  constructor(private readonly walletService: WalletService) {}

  @Get('paymaster-status')
  @ApiOperation({ summary: 'Diagnostic: try prepareUserOp on each chain with real account' })
  getPaymasterStatus(@CurrentUser() user: JwtUser) {
    return this.walletService.checkPaymasterStatus(user.id);
  }
}
