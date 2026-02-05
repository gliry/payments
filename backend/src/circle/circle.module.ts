import { Global, Module } from '@nestjs/common';
import { CircleService } from './circle.service';
import { GatewayService } from './gateway/gateway.service';

@Global()
@Module({
  providers: [CircleService, GatewayService],
  exports: [CircleService, GatewayService],
})
export class CircleModule {}
