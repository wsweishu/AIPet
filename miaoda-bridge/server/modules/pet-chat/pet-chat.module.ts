import { Module } from '@nestjs/common';
import { PetChatController } from './pet-chat.controller';
import { OpenApiPetChatController } from './pet-chat.openapi.controller';
import { PetChatService } from './pet-chat.service';
import { PetFeishuService } from './pet-feishu.service';

@Module({
  controllers: [PetChatController, OpenApiPetChatController],
  providers: [PetChatService, PetFeishuService],
})
export class PetChatModule {}
