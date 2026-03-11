import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuid } from 'uuid';

const CIRCLE_CLIENT_URL = 'https://modular-sdk.circle.com/v1/rpc/w3s/buidl';

@Injectable()
export class PasskeyProxyService {
  private readonly logger = new Logger(PasskeyProxyService.name);
  private readonly clientKey: string;
  private readonly appHostname: string;

  constructor(private readonly configService: ConfigService) {
    this.clientKey = this.configService.getOrThrow<string>('CLIENT_KEY');
    // Frontend domain — used for X-AppInfo header and rp.id override
    const appUrl = this.configService.get<string>('APP_URL', 'https://omniflow-app.up.railway.app');
    try {
      this.appHostname = new URL(appUrl).hostname;
    } catch {
      this.appHostname = appUrl;
    }
  }

  /**
   * Get WebAuthn challenge options from Circle RP API.
   * For registration: returns PublicKeyCredentialCreationOptions (challenge, rp, user, etc.)
   * For login: returns PublicKeyCredentialRequestOptions (challenge, allowCredentials, etc.)
   */
  async getOptions(
    mode: 'register' | 'login',
    identifier: string,
  ): Promise<any> {
    const method =
      mode === 'register'
        ? 'rp_getRegistrationOptions'
        : 'rp_getLoginOptions';

    const params =
      mode === 'register'
        ? [identifier] // username
        : [identifier]; // credentialId or empty string

    this.logger.log(`[OPTIONS] mode=${mode}, identifier=${identifier}, method=${method}`);
    const result = await this.rpcCall(method, params);
    this.logger.log(`[OPTIONS] Response keys: ${JSON.stringify(Object.keys(result || {}))}`);
    return result;
  }

  /**
   * Verify a WebAuthn credential with Circle RP API.
   * For registration: verifies attestation, returns { verified: boolean }
   * For login: verifies assertion, returns { publicKey: base64url }
   */
  async verify(mode: 'register' | 'login', credential: any): Promise<any> {
    const method =
      mode === 'register'
        ? 'rp_getRegistrationVerification'
        : 'rp_getLoginVerification';

    this.logger.log(`[VERIFY] mode=${mode}, method=${method}, credentialId=${credential?.id}, credentialType=${credential?.type}, hasResponse=${!!credential?.response}`);
    if (credential?.response) {
      this.logger.debug(`[VERIFY] response keys: ${JSON.stringify(Object.keys(credential.response))}`);
    }

    return this.rpcCall(method, [credential]);
  }

  /**
   * Make a JSON-RPC call to Circle's RP API.
   * Mirrors the SDK's fetchFromApi() format exactly.
   */
  private async rpcCall(method: string, params: any[]): Promise<any> {
    const id = uuid();

    const body = JSON.stringify({
      method,
      params,
      jsonrpc: '2.0',
      id,
    });

    this.logger.log(`[RPC] → ${method} | hostname=${this.appHostname} | params count=${params.length}`);

    const response = await fetch(CIRCLE_CLIENT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.clientKey}`,
        'X-AppInfo': `platform=web;version=1.0.13;uri=${this.appHostname}`,
      },
      body,
    });

    this.logger.log(`[RPC] ← ${method} HTTP ${response.status}`);

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      this.logger.error(
        `[RPC] Circle RP error (HTTP ${response.status}): ${JSON.stringify(errorBody)}`,
      );
      throw new InternalServerErrorException(
        'Passkey service temporarily unavailable',
      );
    }

    const json = await response.json();
    this.logger.log(`[RPC] ← ${method} result: ${JSON.stringify(json).slice(0, 500)}`);

    if ('error' in json) {
      this.logger.error(
        `Circle RP RPC error: ${JSON.stringify(json.error)}`,
      );
      throw new InternalServerErrorException(
        json.error?.message || 'Passkey operation failed',
      );
    }

    return json.result;
  }
}
