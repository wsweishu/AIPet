import { Injectable, Inject, Logger, BadRequestException } from '@nestjs/common';
import { CapabilityService } from '@lark-apaas/fullstack-nestjs-core';
import type { Response } from 'express';
import type {
  PetAction, PetChatRequest, PetChatResponse, PetChatTurn, PetPlanRequest, PetPlanResponse,
} from '@shared/api.interface';

const PLUGIN_INSTANCE_ID = 'pet-chat';
const ACTION_KEY = 'textGenerate';
const INTENT_INSTANCE_ID = 'pet-intent';
const INTENT_ACTION_KEY = 'textToJson';
const ACTIONS: readonly PetAction[] = ['calendar_agenda', 'task_list', 'none'];
const MAX_TOOL_RESULT_CHARS = 4000;
const MAX_HISTORY_TURNS = 10;
const MAX_TURN_CHARS = 500;
const EMPTY = '（无）';

// callStream chunks are documented as { content } but may arrive wrapped or as plain strings
function chunkText(chunk: unknown): string {
  if (typeof chunk === 'string') return chunk;
  if (typeof chunk === 'object' && chunk !== null) {
    if ('content' in chunk && typeof chunk.content === 'string') return chunk.content;
    if ('response' in chunk && typeof chunk.response === 'string') return chunk.response;
    if ('data' in chunk) return chunkText(chunk.data);
  }
  return '';
}

function toIterable(output: unknown): AsyncIterable<unknown> {
  if (typeof output === 'object' && output !== null) {
    if (Symbol.asyncIterator in output) return output as AsyncIterable<unknown>;
    if ('output' in output) return toIterable(output.output);
  }
  throw new Error('callStream returned a non-iterable value');
}

function formatHistory(history: unknown): string {
  if (!Array.isArray(history)) return '';
  return history
    .filter((t): t is PetChatTurn =>
      typeof t === 'object' && t !== null && (t.role === 'user' || t.role === 'pet') && typeof t.content === 'string')
    .slice(-MAX_HISTORY_TURNS)
    .map(t => `${t.role === 'user' ? '用户' : '肥鱼'}：${t.content.slice(0, MAX_TURN_CHARS)}`)
    .join('\n');
}

@Injectable()
export class PetChatService {
  private readonly logger = new Logger(PetChatService.name);

  constructor(@Inject(CapabilityService) private readonly capabilityService: CapabilityService) {}

  async plan(body: PetPlanRequest): Promise<PetPlanResponse> {
    const message = typeof body?.message === 'string' ? body.message.trim() : '';
    if (!message) throw new BadRequestException('message is required');
    const today = typeof body.today === 'string' && body.today.trim() ? body.today.trim().slice(0, 40) : EMPTY;
    try {
      const output: unknown = await this.capabilityService
        .load(INTENT_INSTANCE_ID)
        .call(INTENT_ACTION_KEY, { message, history: formatHistory(body.history) || EMPTY, today });
      // the model's answer is untrusted: only a known action and a well-formed date survive
      const raw = typeof output === 'object' && output !== null ? (output as Record<string, unknown>) : {};
      const action = ACTIONS.find(a => a === raw.action) ?? 'none';
      const date = action === 'calendar_agenda' && typeof raw.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.date)
        ? raw.date
        : '';
      return { action, date };
    } catch (error) {
      this.logger.error('pet-intent capability call failed', {
        pluginInstanceId: INTENT_INSTANCE_ID,
        actionKey: INTENT_ACTION_KEY,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  async *stream(message: string, history: string, userName: string, toolResult: string): AsyncGenerator<string> {
    try {
      // The plugin rejects empty strings for declared params, so absent values become a placeholder
      const output: unknown = this.capabilityService
        .load(PLUGIN_INSTANCE_ID)
        .callStream(ACTION_KEY, {
          message, history: history || EMPTY, userName: userName || EMPTY, toolResult: toolResult || EMPTY,
        });
      for await (const chunk of toIterable(output)) {
        const text = chunkText(chunk);
        if (text) yield text;
      }
    } catch (error) {
      this.logger.error('pet-chat capability call failed', {
        pluginInstanceId: PLUGIN_INSTANCE_ID,
        actionKey: ACTION_KEY,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  // Shared by the /openapi and /api controllers: JSON reply, or SSE when body.stream is true.
  async respond(body: PetChatRequest, userName: string, res: Response): Promise<void> {
    const message = typeof body?.message === 'string' ? body.message.trim() : '';
    if (!message) throw new BadRequestException('message is required');
    const history = formatHistory(body.history);
    const toolResult = typeof body.toolResult === 'string' ? body.toolResult.slice(0, MAX_TOOL_RESULT_CHARS) : '';
    const started = Date.now();

    if (!body.stream) {
      let reply = '';
      for await (const part of this.stream(message, history, userName, toolResult)) reply += part;
      const result: PetChatResponse = { reply, elapsedMs: Date.now() - started };
      res.json(result);
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    try {
      for await (const text of this.stream(message, history, userName, toolResult)) {
        res.write(`data: ${JSON.stringify({ content: text, t: Date.now() - started })}\n\n`);
      }
      res.write(`event: done\ndata: ${JSON.stringify({ elapsedMs: Date.now() - started })}\n\n`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      res.write(`event: error\ndata: ${JSON.stringify({ message: msg })}\n\n`);
    }
    res.end();
  }
}
