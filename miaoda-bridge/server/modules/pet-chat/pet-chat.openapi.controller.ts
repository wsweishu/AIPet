import { Controller, Post, Body, Res, Logger } from '@nestjs/common';
import type { Response } from 'express';
import type { PetChatRequest, PetPlanRequest, PetPlanResponse } from '@shared/api.interface';
import { PetChatService } from './pet-chat.service';

// API-key access (one key per pet install, managed in Miaoda). Identity is the system identity,
// so the caller-supplied userName is only used to address the user in replies.
@Controller('openapi/pet')
export class OpenApiPetChatController {
  private readonly logger = new Logger(OpenApiPetChatController.name);

  constructor(private readonly petChatService: PetChatService) {}

  @Post('plan')
  plan(@Body() body: PetPlanRequest): Promise<PetPlanResponse> {
    return this.petChatService.plan(body);
  }

  @Post('chat')
  async chat(@Body() body: PetChatRequest, @Res() res: Response): Promise<void> {
    const userName = typeof body?.userName === 'string' ? body.userName.slice(0, 40) : '';
    this.logger.log('openapi pet chat', { userName, stream: Boolean(body?.stream) });
    await this.petChatService.respond(body, userName, res);
  }
}
