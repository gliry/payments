import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'; // generatePrivateKey: TODO restore
import { PrismaService } from '../common/prisma/prisma.service';
import { CircleService } from '../circle/circle.service';
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
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findFirst({
      where: {
        OR: [
          { username: dto.username },
          { credentialId: dto.credentialId },
        ],
      },
    });

    if (existing) {
      throw new ConflictException('User already exists');
    }

    // Compute MSCA wallet address from Passkey credential via Circle API
    this.logger.log(`Computing wallet address for ${dto.username}...`);
    const walletAddress = await this.circleService.computeWalletAddress(
      dto.credentialId,
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
    // TODO: restore per-user delegate generation after testing
    // const delegatePrivateKey = generatePrivateKey();
    // const delegateAccount = privateKeyToAccount(delegatePrivateKey);
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
        credentialId: dto.credentialId,
        publicKey: dto.publicKey,
        walletAddress,
        delegateAddress: delegateAccount.address,
        delegateEncryptedKey,
      },
    });

    const token = await this.generateToken(user.id, user.username);

    this.logger.log(`User ${dto.username} registered with wallet ${walletAddress}`);

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
    const user = await this.prisma.user.findUnique({
      where: { username: dto.username },
    });

    if (!user || user.credentialId !== dto.credentialId) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const token = await this.generateToken(user.id, user.username);

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
