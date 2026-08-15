import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { REFRESH_COOKIE_NAME, REFRESH_COOKIE_PATH } from './auth.constants';
import type { AuthenticatedUser, RequestMetadata } from './auth.types';

/**
 * `/api/v1/auth` (docs/API_CONTRACT.md sections 17-21).
 *
 * The controller only validates input, moves the refresh token between the
 * HttpOnly cookie and the service, and shapes the response. All session logic
 * lives in `AuthService` (docs/BACKEND.md section 5).
 */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.login(
      { email: dto.email, password: dto.password },
      requestMetadata(request),
    );

    this.setRefreshCookie(response, result.refreshToken, result.refreshExpiresIn);

    // refreshToken is intentionally absent: it travels only in the HttpOnly
    // cookie and must not be readable from JavaScript (API_CONTRACT.md 6).
    return {
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
      user: result.user,
    };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const result = await this.authService.refresh(
      readRefreshCookie(request),
      requestMetadata(request),
    );

    this.setRefreshCookie(response, result.refreshToken, result.refreshExpiresIn);

    return { accessToken: result.accessToken, expiresIn: result.expiresIn };
  }

  /**
   * Public because a client whose access token already expired must still be
   * able to end its session. Authority comes from the refresh cookie itself.
   */
  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    await this.authService.logout(readRefreshCookie(request));
    this.clearRefreshCookie(response);
  }

  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getCurrentUser(user.id);
  }

  private setRefreshCookie(response: Response, token: string, maxAgeSeconds: number): void {
    response.cookie(REFRESH_COOKIE_NAME, token, {
      ...this.cookieOptions(),
      maxAge: maxAgeSeconds * 1000,
    });
  }

  private clearRefreshCookie(response: Response): void {
    response.clearCookie(REFRESH_COOKIE_NAME, this.cookieOptions());
  }

  /**
   * Pilot frontend (Vercel) and backend (Railway) are on different domains, so
   * the cookie needs `SameSite=None`, which browsers only accept together with
   * `Secure`. Local http development therefore falls back to `Lax`
   * (docs/API_CONTRACT.md section 8).
   */
  private cookieOptions(): CookieOptions {
    const isProduction = this.config.get<boolean>('app.isProduction') ?? false;

    return {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      path: REFRESH_COOKIE_PATH,
    };
  }
}

function readRefreshCookie(request: Request): string | undefined {
  const cookies = (request as Request & { cookies?: Record<string, string> }).cookies;
  return cookies?.[REFRESH_COOKIE_NAME];
}

function requestMetadata(request: Request): RequestMetadata {
  return {
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  };
}
