import { Global, Module } from '@nestjs/common';
import { LifiService } from './lifi.service';

@Global()
@Module({
  providers: [LifiService],
  exports: [LifiService],
})
export class LifiModule {}
