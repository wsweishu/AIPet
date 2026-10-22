import { Controller, Get, Post, Body, Req, Res, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import type {
  PetChatRequest, PetClaimResponse, PetMeResponse, PetPlanRequest, PetPlanResponse,
} from '@shared/api.interface';
import { PetChatService } from './pet-chat.service';

// Release assets keep the same file names across versions, so latest/download always serves the newest build.
const RELEASES = 'https://github.com/wsweishu/AIPet/releases/latest/download';
const DEFAULT_DOWNLOAD_MAC = `${RELEASES}/AIPet-fatfish-macos-arm64.zip`;
const DEFAULT_DOWNLOAD_WIN = `${RELEASES}/AIPet-fatfish-windows-x64.zip`;
// What the pet asks lark-cli for on the first Feishu question (read-only calendar and tasks).
const PET_SCOPES = ['calendar:calendar.event:read', 'task:task:read'];

// Feishu-login access: the user comes from req.userContext, never from the request body.
@Controller('api/pet')
export class PetChatController {
  private readonly logger = new Logger(PetChatController.name);

  constructor(private readonly petChatService: PetChatService) {}

  // Claiming is open to everyone who can sign in; each claim is logged (who and when) for the admin.
  @NeedLogin()
  @Post('claim')
  claim(@Req() req: Request): PetClaimResponse {
    const { userId, userName } = req.userContext;
    this.logger.log('pet claimed', { userId, userName });
    const host = req.get('x-forwarded-host') ?? req.get('host') ?? '';
    const proto = req.get('x-forwarded-proto') ?? req.protocol;
    const basePath = process.env.CLIENT_BASE_PATH ?? '';
    return {
      userName: userName ?? '',
      downloadUrlMac: process.env.PET_DOWNLOAD_URL_MAC || DEFAULT_DOWNLOAD_MAC,
      downloadUrlWin: process.env.PET_DOWNLOAD_URL_WIN || DEFAULT_DOWNLOAD_WIN,
      appUrl: process.env.PET_APP_URL || `${proto}://${host}${basePath}`,
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
}
