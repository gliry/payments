import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { DepositsService } from './deposits.service';
import { CreateDepositDto } from './dto/create-deposit.dto';
import { CreateDepositAddressDto } from './dto/create-deposit-address.dto';

@ApiTags('deposits')
@Controller('deposits')
export class DepositsController {
  constructor(private readonly depositsService: DepositsService) {}

  @Post('address')
  @ApiOperation({ summary: 'Get deposit address for a chain' })
  @ApiResponse({ status: 201, description: 'Deposit address created' })
  createAddress(@Body() dto: CreateDepositAddressDto) {
    return this.depositsService.createAddress(dto);
  }

  @Post()
  @ApiOperation({ summary: 'Create deposit intent' })
  @ApiResponse({ status: 201, description: 'Deposit intent created' })
  create(@Body() createDepositDto: CreateDepositDto) {
    return this.depositsService.create(createDepositDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all deposits' })
  @ApiResponse({ status: 200, description: 'List of deposits' })
  findAll() {
    return this.depositsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get deposit by ID' })
  @ApiResponse({ status: 200, description: 'Deposit details' })
  @ApiResponse({ status: 404, description: 'Deposit not found' })
  findOne(@Param('id') id: string) {
    return this.depositsService.findOne(id);
  }
}
