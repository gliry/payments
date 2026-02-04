import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHealth() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'OmniFlow API',
    };
  }

  getVersion() {
    return {
      version: '1.0.0',
      name: 'OmniFlow API',
      description: 'Stripe-like API for cross-chain crypto payments',
    };
  }
}
