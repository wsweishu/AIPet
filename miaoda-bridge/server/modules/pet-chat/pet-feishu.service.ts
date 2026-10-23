import { Injectable, Logger, BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import type { PetFeishuAuthorizeResponse, PetFeishuTokenResponse } from '@shared/api.interface';

// Feishu OAuth for the pet, using our own Feishu custom app. The app secret stays here on the server;
// the pet only ever sees the user's own tokens, and calls Feishu's OpenAPI with them directly.
const AUTHORIZE_URL = 'https://accounts.feishu.cn/open-apis/authen/v1/authorize';
// v3 rejects some valid requests (20049), so the token exchange stays on v2 for now
const TOKEN_URL = 'https://open.feishu.cn/open-apis/authen/v2/oauth/token';
// Read-only calendar and tasks, plus offline_access for a refresh token
export const PET_SCOPES = ['calendar:calendar:read', 'calendar:calendar.event:read', 'task:task:read', 'offline_access'];
const CALLBACK_PATH = '/api/pet/feishu/callback';

interface FeishuTokenBody {
  code: number;
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
}

@Injectable()
export class PetFeishuService {
  private readonly logger = new Logger(PetFeishuService.name);

  private credentials(): { appId: string; appSecret: string } {
    const appId = process.env.FEISHU_APP_ID ?? '';
    const appSecret = process.env.FEISHU_APP_SECRET ?? '';
    if (!appId || !appSecret) throw new ServiceUnavailableException('管理员还没有配置飞书应用（FEISHU_APP_ID / FEISHU_APP_SECRET）');
    return { appId, appSecret };
  }

  // Must match a redirect URL registered in the Feishu app's security settings exactly.
  redirectUri(appUrl: string): string {
    return process.env.FEISHU_REDIRECT_URI || `${appUrl}${CALLBACK_PATH}`;
  }

  authorizeUrl(state: unknown, appUrl: string): PetFeishuAuthorizeResponse {
    if (typeof state !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(state)) throw new BadRequestException('state is invalid');
    const { appId } = this.credentials();
    const redirectUri = this.redirectUri(appUrl);
    const url = new URL(AUTHORIZE_URL);
    url.searchParams.set('client_id', appId);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('scope', PET_SCOPES.join(' '));
    url.searchParams.set('state', state);
    return { url: url.toString(), redirectUri };
  }

  exchangeCode(code: unknown, appUrl: string): Promise<PetFeishuTokenResponse> {
    if (typeof code !== 'string' || !code || code.length > 512) throw new BadRequestException('code is required');
    return this.requestToken({ grant_type: 'authorization_code', code, redirect_uri: this.redirectUri(appUrl) });
  }

  refresh(refreshToken: unknown): Promise<PetFeishuTokenResponse> {
    if (typeof refreshToken !== 'string' || !refreshToken || refreshToken.length > 4096) {
      throw new BadRequestException('refreshToken is required');
    }
    return this.requestToken({ grant_type: 'refresh_token', refresh_token: refreshToken });
  }

  private async requestToken(params: Record<string, string>): Promise<PetFeishuTokenResponse> {
    const { appId, appSecret } = this.credentials();
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ ...params, client_id: appId, client_secret: appSecret }),
    });
    const body = (await res.json().catch(() => ({ code: -1 }))) as FeishuTokenBody;
    if (body.code !== 0 || !body.access_token) {
      // never log tokens; the error fields carry no secrets
      this.logger.warn('feishu token request failed', { grantType: params.grant_type, status: res.status, code: body.code, error: body.error });
      throw new BadRequestException(`飞书授权失败：${body.error_description || body.error || `code ${body.code}`}`);
    }
    return {
      accessToken: body.access_token,
      expiresIn: body.expires_in ?? 0,
      refreshToken: body.refresh_token ?? '',
      refreshExpiresIn: body.refresh_token_expires_in ?? 0,
      scope: body.scope ?? '',
    };
  }
}
