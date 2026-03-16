import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { privateKeyToAccount } from 'viem/accounts';
import { PrismaService } from '../common/prisma/prisma.service';
import { CircleService } from '../circle/circle.service';
import { PasskeyProxyService } from './passkey-proxy.service';
import {
  encryptPrivateKey,
  decryptPrivateKey,
} from '../common/crypto/delegate-keys';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly circleService: CircleService,
    private readonly passkeyProxy: PasskeyProxyService,
  ) {}

  async register(dto: RegisterDto) {
    const credentialId = dto.credential?.id;
    this.logger.log(`[REGISTER] Start: username=${dto.username}, credentialId=${credentialId}, publicKey=${dto.publicKey?.slice(0, 20)}...`);

    if (!credentialId || typeof credentialId !== 'string') {
      this.logger.warn(`[REGISTER] Missing credential.id — got: ${typeof credentialId}`);
      throw new BadRequestException('credential.id is required');
    }

    const existing = await this.prisma.user.findFirst({
      where: {
        OR: [
          { username: dto.username },
          { credentialId },
        ],
      },
    });

    if (existing) {
      this.logger.warn(`[REGISTER] Conflict: username=${dto.username}, existingUser=${existing.username}`);
      throw new ConflictException('User already exists');
    }

    // Verify credential with SimpleWebAuthn
    this.logger.log(`[REGISTER] Verifying credential...`);
    const verification = await this.passkeyProxy.verify(
      'register',
      dto.credential,
      dto.username,
    );

    if (!verification?.verified) {
      this.logger.warn(`[REGISTER] Verification failed`);
      throw new BadRequestException('Passkey credential verification failed');
    }

    // Compute Kernel wallet address from Passkey credential
    this.logger.log(`[REGISTER] Computing wallet address...`);
    const walletAddress = await this.circleService.computeWalletAddress(
      credentialId,
      dto.publicKey,
    );

    // Check if wallet address is already taken
    const existingWallet = await this.prisma.user.findUnique({
      where: { walletAddress },
    });
    if (existingWallet) {
      throw new ConflictException('Wallet address already registered');
    }

    // Generate server-side delegate EOA for Gateway burn intent signing
    const delegatePrivateKey = this.configService.getOrThrow<string>('SHARED_DELEGATE_PRIVATE_KEY') as `0x${string}`;
    const delegateAccount = privateKeyToAccount(delegatePrivateKey);

    const encryptionKey = this.configService.getOrThrow<string>(
      'DELEGATE_ENCRYPTION_KEY',
    );
    const delegateEncryptedKey = encryptPrivateKey(
      delegatePrivateKey,
      encryptionKey,
    );

    const user = await this.prisma.user.create({
      data: {
        username: dto.username,
        credentialId,
        publicKey: dto.publicKey,
        walletAddress,
        delegateAddress: delegateAccount.address,
        delegateEncryptedKey,
      },
    });

    const token = await this.generateToken(user.id, user.username);

    this.logger.log(`[REGISTER] Success: username=${dto.username}, wallet=${walletAddress}, userId=${user.id}`);

    return {
      user: {
        id: user.id,
        username: user.username,
        walletAddress: user.walletAddress,
        delegateAddress: user.delegateAddress,
      },
      accessToken: token,
    };
  }

  async login(dto: LoginDto) {
    const credentialId = dto.credential?.id;
    this.logger.log(`[LOGIN] Start: username=${dto.username}, credentialId=${credentialId}`);

    if (!credentialId || typeof credentialId !== 'string') {
      this.logger.warn(`[LOGIN] Missing credential.id`);
      throw new BadRequestException('credential.id is required');
    }

    const user = await this.prisma.user.findUnique({
      where: { username: dto.username },
    });

    if (!user) {
      this.logger.warn(`[LOGIN] User not found: username=${dto.username}`);
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.credentialId !== credentialId) {
      this.logger.warn(`[LOGIN] Credential mismatch for ${dto.username}`);
      throw new UnauthorizedException('Invalid credentials');
    }

    this.logger.log(`[LOGIN] Verifying with SimpleWebAuthn...`);

    const verification = await this.passkeyProxy.verify(
      'login',
      dto.credential,
      dto.username,
      user.publicKey,
      user.credentialId,
    );

    if (!verification?.verified) {
      throw new UnauthorizedException('Passkey verification failed');
    }

    const token = await this.generateToken(user.id, user.username);
    this.logger.log(`[LOGIN] Success: username=${dto.username}, userId=${user.id}`);

    return {
      user: {
        id: user.id,
        username: user.username,
        walletAddress: user.walletAddress,
        delegateAddress: user.delegateAddress,
      },
      accessToken: token,
    };
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        walletAddress: true,
        delegateAddress: true,
        createdAt: true,
      },
    });

    if (!user) throw new UnauthorizedException('User not found');
    return user;
  }

  getDelegatePrivateKey(user: { delegateEncryptedKey: string }): string {
    const encryptionKey = this.configService.getOrThrow<string>(
      'DELEGATE_ENCRYPTION_KEY',
    );
    return decryptPrivateKey(user.delegateEncryptedKey, encryptionKey);
  }

  private async generateToken(
    userId: string,
    username: string,
  ): Promise<string> {
    return this.jwtService.signAsync({ sub: userId, username });
  }
}
