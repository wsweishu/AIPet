/* 前后端共享的类型写在这里 */

/** 一轮对话记录 */
export interface PetChatTurn {
  /** user = 用户说的话，pet = 桌宠的回复 */
  role: 'user' | 'pet';
  /** 这一轮的文本 */
  content: string;
}

/** POST /openapi/pet/chat 与 POST /api/pet/chat 的请求体 */
export interface PetChatRequest {
  /** 用户这一次对桌宠说的话 */
  message: string;
  /** true 时以 SSE（text/event-stream）逐段返回 */
  stream?: boolean;
  /** 最近几轮对话，旧的在前；服务端只取最后 10 轮 */
  history?: PetChatTurn[];
  /** 用户的称呼；/api 路由忽略此字段，改用登录用户的名字 */
  userName?: string;
  /** 桌宠刚用 lark-cli 查到的飞书结果（精简文本），回答时以此为准 */
  toolResult?: string;
}

/** 桌宠可以在本机用 lark-cli 只读执行的动作 */
export type PetAction = 'calendar_agenda' | 'task_list' | 'none';

/** POST /openapi/pet/plan 与 POST /api/pet/plan 的请求体 */
export interface PetPlanRequest {
  /** 用户这一次对桌宠说的话 */
  message: string;
  /** 最近几轮对话，旧的在前 */
  history?: PetChatTurn[];
  /** 用户本地的今天，如「2026-10-22 星期四」 */
  today: string;
}

/** 意图识别结果 */
export interface PetPlanResponse {
  /** 要执行的动作 */
  action: PetAction;
  /** calendar_agenda 时要查看的日期（YYYY-MM-DD），其他动作为空字符串 */
  date: string;
}

/** 非流式响应 */
export interface PetChatResponse {
  /** 桌宠的完整回复 */
  reply: string;
  /** 从请求到生成结束的耗时（毫秒） */
  elapsedMs: number;
}

/** GET /api/pet/me 响应：当前飞书登录用户 */
export interface PetMeResponse {
  /** 妙搭用户 ID */
  userId: string;
  /** 用户姓名 */
  userName: string;
  /** preview = 预览态，runtime = 发布运行态 */
  env: string;
}
