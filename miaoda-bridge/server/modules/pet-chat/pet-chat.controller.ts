import { Controller, Get, Post, Body, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import type { PetChatRequest, PetMeResponse, PetPlanRequest, PetPlanResponse } from '@shared/api.interface';
import { PetChatService } from './pet-chat.service';

// Feishu-login access: the user comes from req.userContext, never from the request body.
@Controller('api/pet')
export class PetChatController {
  constructor(private readonly petChatService: PetChatService) {}

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
