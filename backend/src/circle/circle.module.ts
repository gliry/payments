import { Global, Module } from '@nestjs/common';
import { AccountService } from './account.service';
import { CircleService } from './circle.service';
import { GatewayService } from './gateway/gateway.service';
import { RpcService } from './rpc.service';
import { UserOpService } from './userop.service';

@Global()
@Module({
  providers: [AccountService, CircleService, GatewayService, RpcService, UserOpService],
  exports: [AccountService, CircleService, GatewayService, RpcService, UserOpService],
})
export class CircleModule {}
