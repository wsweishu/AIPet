import { Module } from '@nestjs/common';
import { PetChatController } from './pet-chat.controller';
import { OpenApiPetChatController } from './pet-chat.openapi.controller';
import { PetChatService } from './pet-chat.service';

@Module({
  controllers: [PetChatController, OpenApiPetChatController],
  providers: [PetChatService],
})
export class PetChatModule {}
