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
import { PrepareBridgeDto } from './dto/prepare-bridge.dto';
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
  @ApiOperation({ summary: 'Prepare send operation (send USDC to an address)' })
  prepareSend(
    @CurrentUser() user: JwtUser,
    @Body() dto: PrepareSendDto,
  ) {
    return this.operationsService.prepareSend(user.id, dto);
  }

  @Post('bridge')
  @ApiOperation({ summary: 'Prepare bridge operation (move USDC between chains)' })
  prepareBridge(
    @CurrentUser() user: JwtUser,
    @Body() dto: PrepareBridgeDto,
  ) {
    return this.operationsService.prepareBridge(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List operations history' })
  @ApiQuery({ name: 'type', required: false, enum: ['COLLECT', 'SEND', 'BRIDGE'] })
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
