import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { OperationsService } from './operations.service';
import { PrepareCollectDto } from './dto/prepare-collect.dto';
import { PrepareSendDto } from './dto/prepare-send.dto';
import { PrepareSwapDepositDto } from './dto/prepare-swap-deposit.dto';
import { SubmitOperationDto } from './dto/submit-operation.dto';
import {
  AuthGuard,
  CurrentUser,
  JwtUser,
} from '../common/guards/auth.guard';

@ApiTags('operations')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('operations')
export class OperationsController {
  constructor(private readonly operationsService: OperationsService) {}

  @Post('collect')
  @ApiOperation({ summary: 'Prepare collect operation (gather USDC from multiple chains)' })
  prepareCollect(
    @CurrentUser() user: JwtUser,
    @Body() dto: PrepareCollectDto,
  ) {
    return this.operationsService.prepareCollect(user.id, dto);
  }

  @Post('send')
  @ApiOperation({ summary: 'Prepare send/bridge/batch operation (unified endpoint)' })
  prepareSend(
    @CurrentUser() user: JwtUser,
    @Body() dto: PrepareSendDto,
  ) {
    return this.operationsService.prepareSend(user.id, dto);
  }

  @Post('swap-deposit')
  @ApiOperation({ summary: 'Prepare swap-deposit (any token → USDC → Gateway)' })
  prepareSwapDeposit(
    @CurrentUser() user: JwtUser,
    @Body() dto: PrepareSwapDepositDto,
  ) {
    return this.operationsService.prepareSwapDeposit(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List operations history' })
  @ApiQuery({ name: 'type', required: false, enum: ['COLLECT', 'SEND', 'BRIDGE', 'BATCH_SEND', 'SWAP_DEPOSIT'] })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  getOperations(
    @CurrentUser() user: JwtUser,
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.operationsService.getOperations(
      user.id,
      type,
      status,
      limit ? parseInt(limit, 10) : undefined,
      offset ? parseInt(offset, 10) : undefined,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get operation details and current sign requests' })
  getOperation(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
  ) {
    return this.operationsService.getOperation(user.id, id);
  }

  @Post(':id/refresh-swap')
  @ApiOperation({ summary: 'Refresh LiFi swap quote (get fresh calldata before signing)' })
  refreshSwapQuote(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
  ) {
    return this.operationsService.refreshSwapQuote(user.id, id);
  }

  @Post(':id/submit')
  @ApiOperation({ summary: 'Submit signed transactions for an operation' })
  submitOperation(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: SubmitOperationDto,
  ) {
    return this.operationsService.submitOperation(user.id, id, dto);
  }
}
