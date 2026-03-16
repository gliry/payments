import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { p256 } from '@noble/curves/nist.js';

@Injectable()
export class PasskeyProxyService {
  private readonly logger = new Logger(PasskeyProxyService.name);
  private readonly rpID: string;
  private readonly rpName: string;
  private readonly rpOrigin: string;

  /** In-memory challenge store keyed by username. */
  private readonly challenges = new Map<string, string>();

  constructor(private readonly configService: ConfigService) {
    this.rpID = this.configService.getOrThrow<string>('RP_ID');
    this.rpName = this.configService.get<string>('RP_NAME', 'OmniFlow');
    this.rpOrigin = this.configService.getOrThrow<string>('RP_ORIGIN');
  }

  /**
   * Generate WebAuthn challenge options.
   * For registration: returns PublicKeyCredentialCreationOptions
   * For login: returns PublicKeyCredentialRequestOptions
   */
  async getOptions(
    mode: 'register' | 'login',
    identifier: string,
    existingCredentialId?: string,
  ): Promise<any> {
    this.logger.log(
      `[OPTIONS] mode=${mode}, identifier=${identifier}`,
    );

    if (mode === 'register') {
      const options = await generateRegistrationOptions({
        rpName: this.rpName,
        rpID: this.rpID,
        userName: identifier,
        attestationType: 'none',
        authenticatorSelection: {
          residentKey: 'preferred',
          userVerification: 'preferred',
        },
      });

      this.challenges.set(identifier, options.challenge);
      this.logger.log(`[OPTIONS] Registration options generated for ${identifier}`);
      return options;
    }

    // login
    const options = await generateAuthenticationOptions({
      rpID: this.rpID,
      allowCredentials: existingCredentialId
        ? [{ id: existingCredentialId }]
        : [],
      userVerification: 'preferred',
    });

    this.challenges.set(identifier, options.challenge);
    this.logger.log(`[OPTIONS] Authentication options generated for ${identifier}`);
    return options;
  }

  /**
   * Verify a WebAuthn credential.
   * For registration: verifies attestation
   * For login: verifies assertion
   */
  async verify(
    mode: 'register' | 'login',
    credential: any,
    username: string,
    storedPublicKey?: string,
    storedCredentialId?: string,
  ): Promise<{ verified: boolean }> {
    const expectedChallenge = this.challenges.get(username);
    if (!expectedChallenge) {
      this.logger.warn(`[VERIFY] No stored challenge for ${username}`);
      throw new InternalServerErrorException('No challenge found — call getOptions first');
    }

    this.logger.log(`[VERIFY] mode=${mode}, credentialId=${credential?.id}`);

    try {
      if (mode === 'register') {
        const verification = await verifyRegistrationResponse({
          response: credential,
          expectedChallenge,
          expectedOrigin: this.rpOrigin,
          expectedRPID: this.rpID,
        });

        this.challenges.delete(username);
        this.logger.log(`[VERIFY] Registration verified=${verification.verified}`);
        return { verified: verification.verified };
      }

      // login
      if (!storedPublicKey || !storedCredentialId) {
        throw new InternalServerErrorException(
          'storedPublicKey and storedCredentialId required for login verification',
        );
      }

      // Convert stored compressed P256 hex key → COSE format for SimpleWebAuthn
      const coseKey = compressedP256ToCose(storedPublicKey);

      const verification = await verifyAuthenticationResponse({
        response: credential,
        expectedChallenge,
        expectedOrigin: this.rpOrigin,
        expectedRPID: this.rpID,
        credential: {
          id: storedCredentialId,
          publicKey: coseKey,
          counter: 0, // We don't track counters — passkey replay protection is optional
        },
      });

      this.challenges.delete(username);
      this.logger.log(`[VERIFY] Authentication verified=${verification.verified}`);
      return { verified: verification.verified };
    } catch (error) {
      this.challenges.delete(username);
      this.logger.error(`[VERIFY] Verification error: ${error}`);
      throw new InternalServerErrorException(
        `Passkey verification failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }
}

/**
 * Convert a compressed P256 public key (hex) to COSE_Key format (CBOR-encoded).
 * SimpleWebAuthn expects COSE keys for verifyAuthenticationResponse.
 *
 * COSE_Key map for EC2/P-256:
 *   1 (kty) → 2 (EC2)
 *   3 (alg) → -7 (ES256)
 *  -1 (crv) → 1 (P-256)
 *  -2 (x)   → 32 bytes
 *  -3 (y)   → 32 bytes
 */
function compressedP256ToCose(hex: string): Uint8Array<ArrayBuffer> {
  // Decompress to get x, y (each 32 bytes)
  const cleaned = hex.startsWith('0x') ? hex.slice(2) : hex;
  const point = p256.Point.fromHex(cleaned);
  const xBytes = bigintToBytes(point.x, 32);
  const yBytes = bigintToBytes(point.y, 32);

  // Hand-encode CBOR map with 5 entries
  // A5                 — map(5)
  //   01 02            — 1: 2 (kty: EC2)
  //   03 26            — 3: -7 (alg: ES256)  (-7 = major 1, value 6 → 0x26)
  //   20 01            — -1: 1 (crv: P-256)  (-1 = major 1, value 0 → 0x20)
  //   21 5820 <x 32B>  — -2: bstr(32) x
  //   22 5820 <y 32B>  — -3: bstr(32) y
  const header = [
    0xa5,             // map(5)
    0x01, 0x02,       // 1: 2
    0x03, 0x26,       // 3: -7
    0x20, 0x01,       // -1: 1
    0x21, 0x58, 0x20, // -2: bstr(32)
  ];
  const middle = [
    0x22, 0x58, 0x20, // -3: bstr(32)
  ];

  const buffer = new ArrayBuffer(header.length + 32 + middle.length + 32);
  const result = new Uint8Array(buffer);
  let offset = 0;
  result.set(header, offset); offset += header.length;
  result.set(xBytes, offset); offset += 32;
  result.set(middle, offset); offset += middle.length;
  result.set(yBytes, offset);

  return result;
}

function bigintToBytes(n: bigint, len: number): Uint8Array {
  const hex = n.toString(16).padStart(len * 2, '0');
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
