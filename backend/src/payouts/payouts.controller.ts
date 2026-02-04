import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { PayoutsService } from './payouts.service';
import { CreatePayoutDto } from './dto/create-payout.dto';
import { CreateBatchPayoutDto } from './dto/create-batch-payout.dto';

@ApiTags('payouts')
@Controller('payouts')
export class PayoutsController {
  constructor(private readonly payoutsService: PayoutsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a single payout' })
  @ApiResponse({ status: 201, description: 'Payout created' })
  create(@Body() createPayoutDto: CreatePayoutDto) {
    return this.payoutsService.create(createPayoutDto);
  }

  @Post('batch')
  @ApiOperation({ summary: 'Create batch payout' })
  @ApiResponse({ status: 201, description: 'Batch payout created' })
  createBatch(@Body() dto: CreateBatchPayoutDto) {
    return this.payoutsService.createBatch(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all payouts' })
  @ApiResponse({ status: 200, description: 'List of payouts' })
  findAll() {
    return this.payoutsService.findAll();
  }

  @Get('batch/:id')
  @ApiOperation({ summary: 'Get batch payout by ID' })
  @ApiResponse({ status: 200, description: 'Batch payout details' })
  findBatch(@Param('id') id: string) {
    return this.payoutsService.findBatch(id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get payout by ID' })
  @ApiResponse({ status: 200, description: 'Payout details' })
  @ApiResponse({ status: 404, description: 'Payout not found' })
  findOne(@Param('id') id: string) {
    return this.payoutsService.findOne(id);
  }
}
