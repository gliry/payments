import { Global, Module } from '@nestjs/common';
import { CircleService } from './circle.service';
import { GatewayService } from './gateway/gateway.service';
import { UserOpService } from './userop.service';

@Global()
@Module({
  providers: [CircleService, GatewayService, UserOpService],
  exports: [CircleService, GatewayService, UserOpService],
})
export class CircleModule {}
