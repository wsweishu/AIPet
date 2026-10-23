import { Controller, Get, Post, Body, Query, Req, Res, Header, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import type {
  PetChatRequest, PetClaimResponse, PetFeishuAuthorizeResponse, PetFeishuTokenResponse, PetMeResponse, PetPlanRequest,
  PetPlanResponse,
} from '@shared/api.interface';
import { PetChatService } from './pet-chat.service';
import { PetFeishuService, PET_SCOPES } from './pet-feishu.service';

// Release assets keep the same file names across versions, so latest/download always serves the newest build.
const RELEASES = 'https://github.com/wsweishu/AIPet/releases/latest/download';
const DEFAULT_DOWNLOAD_MAC = `${RELEASES}/AIPet-fatfish-macos-arm64.zip`;
const DEFAULT_DOWNLOAD_WIN = `${RELEASES}/AIPet-fatfish-windows-x64.zip`;

// This app's public address, as the browser reached it (PET_APP_URL overrides). No trailing slash:
// CLIENT_BASE_PATH ends with one, and the OAuth redirect URL must match the registered one exactly.
function appUrlOf(req: Request): string {
  const host = req.get('x-forwarded-host') ?? req.get('host') ?? '';
  const proto = req.get('x-forwarded-proto') ?? req.protocol;
  const url = process.env.PET_APP_URL || `${proto}://${host}${process.env.CLIENT_BASE_PATH ?? ''}`;
  return url.replace(/\/+$/, '');
}

// Feishu-login access: the user comes from req.userContext, never from the request body.
@Controller('api/pet')
export class PetChatController {
  private readonly logger = new Logger(PetChatController.name);

  constructor(
    private readonly petChatService: PetChatService,
    private readonly petFeishuService: PetFeishuService,
  ) {}

  // Claiming is open to everyone who can sign in; each claim is logged (who and when) for the admin.
  @NeedLogin()
  @Post('claim')
  claim(@Req() req: Request): PetClaimResponse {
    const { userId, userName } = req.userContext;
    this.logger.log('pet claimed', { userId, userName });
    return {
      userName: userName ?? '',
      downloadUrlMac: process.env.PET_DOWNLOAD_URL_MAC || DEFAULT_DOWNLOAD_MAC,
      downloadUrlWin: process.env.PET_DOWNLOAD_URL_WIN || DEFAULT_DOWNLOAD_WIN,
      appUrl: appUrlOf(req),
      scopes: PET_SCOPES,
    };
  }

  @NeedLogin()
  @Get('me')
  me(@Req() req: Request): PetMeResponse {
    const { userId, userName, env } = req.userContext;
    return { userId, userName, env };
  }

  @NeedLogin()
  @Post('plan')
  plan(@Body() body: PetPlanRequest): Promise<PetPlanResponse> {
    return this.petChatService.plan(body);
  }

  @NeedLogin()
  @Post('chat')
  async chat(@Req() req: Request, @Body() body: PetChatRequest, @Res() res: Response): Promise<void> {
    await this.petChatService.respond(body, req.userContext.userName ?? '', res);
  }

  // ---- Feishu OAuth: the pet opens the authorize page in its own window and catches the redirect ----

  @NeedLogin()
  @Get('feishu/authorize-url')
  feishuAuthorizeUrl(@Req() req: Request, @Query('state') state: string): PetFeishuAuthorizeResponse {
    return this.petFeishuService.authorizeUrl(state, appUrlOf(req));
  }

  // The pet intercepts this redirect before it loads; the page only shows if it was opened elsewhere.
  @Get('feishu/callback')
  @Header('Content-Type', 'text/html; charset=utf-8')
  feishuCallback(): string {
    return '<!doctype html><meta charset="utf-8"><title>AIPet 肥鱼</title><p>飞书授权已完成，可以关闭这个页面，回到肥鱼。</p>';
  }

  @NeedLogin()
  @Post('feishu/token')
  feishuToken(@Req() req: Request, @Body() body: { code?: unknown }): Promise<PetFeishuTokenResponse> {
    this.logger.log('feishu authorized', { userId: req.userContext.userId });
    return this.petFeishuService.exchangeCode(body?.code, appUrlOf(req));
  }

  @NeedLogin()
  @Post('feishu/refresh')
  feishuRefresh(@Body() body: { refreshToken?: unknown }): Promise<PetFeishuTokenResponse> {
    return this.petFeishuService.refresh(body?.refreshToken);
  }
}
