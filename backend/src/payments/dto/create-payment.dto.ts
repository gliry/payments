import { IsString, IsOptional, IsObject, IsNumber, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePaymentDto {
  @ApiProperty({ example: '100.00', description: 'Amount in human-readable format' })
  @IsString()
  amount: string;

  @ApiPropertyOptional({ example: 'USDC', description: 'Token to receive (default: USDC)' })
  @IsString()
  @IsOptional()
  token?: string;

  @ApiPropertyOptional({ example: 'polygon', description: 'Chain to receive on (default: polygon)' })
  @IsString()
  @IsOptional()
  chain?: string;

  @ApiPropertyOptional({ example: 'Order #123' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: { orderId: 'abc' } })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;

  @ApiPropertyOptional({ example: 'https://shop.com/success' })
  @IsString()
  @IsOptional()
  successUrl?: string;

  @ApiPropertyOptional({ example: 'https://shop.com/cart' })
  @IsString()
  @IsOptional()
  cancelUrl?: string;

  @ApiPropertyOptional({ example: 3600, description: 'Seconds until expiry (default: 3600)' })
  @IsNumber()
  @Min(60)
  @IsOptional()
  expiresIn?: number;
}
