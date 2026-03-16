import { Controller, Post, Get, Body, UseGuards, Logger } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { PasskeyProxyService } from './passkey-proxy.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { PasskeyOptionsDto } from './dto/passkey-options.dto';
import {
  AuthGuard,
  CurrentUser,
  JwtUser,
} from '../common/guards/auth.guard';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly authService: AuthService,
    private readonly passkeyProxy: PasskeyProxyService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('passkey/options')
  @ApiOperation({
    summary: 'Get WebAuthn challenge options',
  })
  async getPasskeyOptions(@Body() dto: PasskeyOptionsDto) {
    let existingCredentialId: string | undefined;

    // For login: look up the user's stored credentialId
    if (dto.mode === 'login') {
      const user = await this.prisma.user.findUnique({
        where: { username: dto.username },
        select: { credentialId: true },
      });
      if (user?.credentialId) {
        existingCredentialId = user.credentialId;
        this.logger.log(`[OPTIONS] Login for ${dto.username}: stored credentialId=${existingCredentialId}`);
      } else {
        this.logger.warn(`[OPTIONS] Login for ${dto.username}: user not found in DB`);
      }
    }

    return this.passkeyProxy.getOptions(dto.mode, dto.username, existingCredentialId);
  }

  @Post('register')
  @ApiOperation({ summary: 'Register with Passkey credential' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @ApiOperation({ summary: 'Login with Passkey credential' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Get('me')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user info' })
  me(@CurrentUser() user: JwtUser) {
    return this.authService.getMe(user.id);
  }
}
