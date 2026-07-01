import http from 'node:http';
import path from 'node:path';
import { URL } from 'node:url';

import { fetchJsonWithTimeout } from './http';
import type { IMStore } from './imStore';
import type { IMMessage } from './types';
import type { WhatsAppGatewayStatus,WhatsAppOpenClawConfig } from './types';
import {
  applyWhatsAppDecisionGuard,
  buildWhatsAppStructuredPrompt,
  fallbackWhatsAppDecision,
  parseWhatsAppDecision,
  type WhatsAppInboundMessage,
} from './whatsappDecision';

const HTTP_METHOD = {
  Post: 'POST',
} as const;

const HTTP_PATH = {
  Events: '/whatsapp/events',
  SendResult: '/whatsapp/send-result',
} as const;

const JSON_HEADER = 'application/json; charset=utf-8';
const MAX_DEDUPE_ENTRIES = 5000;

type WhatsAppSendResponse = {
  success?: boolean;
  error?: string;
};

export interface WhatsAppAdapterOptions {
  imStore: IMStore;
  processMessage: (message: IMMessage) => Promise<string>;
}

type ListenerSendPayload = {
  conversationId: string;
  text: string;
  replyToMessageId?: string;
};

function readHeader(req: http.IncomingMessage, name: string): string {
  const value = req.headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0] || '';
  return typeof value === 'string' ? value : '';
}

async function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  return raw ? JSON.parse(raw) : {};
}

function writeJson(res: http.ServerResponse, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode;
  res.setHeader('content-type', JSON_HEADER);
  res.end(JSON.stringify(payload));
}

function sanitizePathSegment(value: string): string {
  return value.startsWith('/') ? value : `/${value}`;
}

function normalizeIncomingMessage(input: unknown): WhatsAppInboundMessage | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return null;
  }
  const record = input as Record<string, unknown>;
  const conversationId = typeof record.conversationId === 'string' ? record.conversationId.trim() : '';
  const messageId = typeof record.messageId === 'string'
    ? record.messageId.trim()
    : (typeof record.id === 'string' ? record.id.trim() : '');
  const content = typeof record.content === 'string' ? record.content.trim() : '';
  const capturedAt = typeof record.capturedAt === 'string'
    ? record.capturedAt
    : new Date().toISOString();
  if (!conversationId || !messageId || !content) {
    return null;
  }

  const direction = record.direction === 'outgoing' ? 'outgoing' : 'incoming';
  return {
    platform: 'whatsapp',
    conversationId,
    messageId,
    chatName: typeof record.chatName === 'string' ? record.chatName.trim() : '',
    senderName: typeof record.senderName === 'string' ? record.senderName.trim() : '',
    direction,
    isGroup: record.isGroup === true,
    content,
    capturedAt,
    raw: input,
  };
}

export class WhatsAppAdapter {
  private readonly imStore: IMStore;
  private readonly processMessage: (message: IMMessage) => Promise<string>;
  private server: http.Server | null = null;
  private status: WhatsAppGatewayStatus = {
    connected: false,
    startedAt: null,
    lastError: null,
    lastInboundAt: null,
    lastOutboundAt: null,
  };
  private lastConfigFingerprint = '';
  private currentConfig: WhatsAppOpenClawConfig | null = null;
  private readonly seenMessageIds = new Set<string>();
  private readonly seenMessageQueue: string[] = [];
  private readonly conversationCooldowns = new Map<string, number>();
  private readonly conversationLocks = new Map<string, Promise<void>>();

  constructor(options: WhatsAppAdapterOptions) {
    this.imStore = options.imStore;
    this.processMessage = options.processMessage;
  }

  getStatus(): WhatsAppGatewayStatus {
    return { ...this.status };
  }

  async sync(config: WhatsAppOpenClawConfig): Promise<void> {
    const fingerprint = JSON.stringify(config);
    if (!config.enabled) {
      this.currentConfig = config;
      this.lastConfigFingerprint = fingerprint;
      await this.stop();
      return;
    }

    const shouldRestart = fingerprint !== this.lastConfigFingerprint;
    this.currentConfig = config;
    this.lastConfigFingerprint = fingerprint;
    if (!shouldRestart && this.server) {
      return;
    }
    await this.stop();
    await this.start(config);
  }

  async stop(): Promise<void> {
    if (!this.server) {
      this.status.connected = false;
      return;
    }

    await new Promise<void>((resolve) => {
      this.server?.close(() => resolve());
    });
    this.server = null;
    this.status.connected = false;
  }

  async sendOutboundMessage(
    conversationId: string,
    text: string,
    replyToMessageId?: string,
  ): Promise<boolean> {
    const config = this.currentConfig;
    if (!config?.listenerBaseUrl.trim()) {
      this.status.lastError = 'WhatsApp listener base URL is not configured.';
      return false;
    }

    const sendUrl = new URL(
      sanitizePathSegment(config.sendEndpointPath.trim() || '/whatsapp/send'),
      config.listenerBaseUrl,
    ).toString();
    const payload: ListenerSendPayload = { conversationId, text };
    if (replyToMessageId?.trim()) {
      payload.replyToMessageId = replyToMessageId.trim();
    }

    try {
      const response = await fetchJsonWithTimeout<WhatsAppSendResponse>(
        sendUrl,
        {
          method: HTTP_METHOD.Post,
          headers: {
            'content-type': 'application/json',
            'x-whatsapp-secret': config.webhookSecret,
          },
          body: JSON.stringify(payload),
        },
        15_000,
      );
      const success = response.success !== false;
      if (success) {
        this.status.lastOutboundAt = Date.now();
        this.status.lastError = null;
      } else {
        this.status.lastError = response.error || 'WhatsApp send endpoint returned an error.';
      }
      return success;
    } catch (error) {
      this.status.lastError = error instanceof Error ? error.message : String(error);
      return false;
    }
  }

  private async start(config: WhatsAppOpenClawConfig): Promise<void> {
    this.server = http.createServer((req, res) => {
      void this.handleRequest(req, res);
    });

    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => {
        this.server?.off('listening', onListening);
        reject(error);
      };
      const onListening = () => {
        this.server?.off('error', onError);
        resolve();
      };
      this.server?.once('error', onError);
      this.server?.once('listening', onListening);
      this.server?.listen(config.webhookPort, config.webhookHost);
    });

    this.status.connected = true;
    this.status.startedAt = Date.now();
    this.status.lastError = null;
  }

  private async handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    try {
      const config = this.currentConfig;
      if (!config) {
        writeJson(res, 503, { success: false, error: 'WhatsApp adapter is not configured.' });
        return;
      }

      const url = new URL(req.url || '/', 'http://127.0.0.1');
      if (req.method !== HTTP_METHOD.Post) {
        writeJson(res, 405, { success: false, error: 'Method not allowed.' });
        return;
      }

      const secret = readHeader(req, 'x-whatsapp-secret');
      if (!config.webhookSecret || secret !== config.webhookSecret) {
        writeJson(res, 401, { success: false, error: 'Unauthorized.' });
        return;
      }

      if (url.pathname === HTTP_PATH.Events) {
        await this.handleIncomingEvent(req, res, config);
        return;
      }
      if (url.pathname === HTTP_PATH.SendResult) {
        await this.handleSendResult(req, res);
        return;
      }

      writeJson(res, 404, { success: false, error: 'Not found.' });
    } catch (error) {
      this.status.lastError = error instanceof Error ? error.message : String(error);
      writeJson(res, 500, { success: false, error: this.status.lastError });
    }
  }

  private async handleIncomingEvent(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    config: WhatsAppOpenClawConfig,
  ): Promise<void> {
    const payload = await readJsonBody(req);
    const message = normalizeIncomingMessage(payload);
    if (!message) {
      writeJson(res, 400, { success: false, error: 'Invalid WhatsApp event payload.' });
      return;
    }
    if (message.direction === 'outgoing') {
      writeJson(res, 200, { success: true, skipped: true });
      return;
    }
    if (this.hasSeenMessage(message.messageId)) {
      writeJson(res, 200, { success: true, deduped: true });
      return;
    }

    this.status.lastInboundAt = Date.now();
    const decision = await this.runWithConversationLock(message.conversationId, async () => {
      return this.processInboundMessage(message, config);
    });
    const shouldSend =
      config.autoReplyEnabled
      && (decision.action === 'reply' || decision.action === 'clarify')
      && Boolean(decision.replyText.trim());

    if (shouldSend && this.isCoolingDown(message.conversationId, config.sendCooldownMs)) {
      writeJson(res, 200, { success: true, skipped: true, reason: 'cooldown' });
      return;
    }

    let sent = false;
    if (shouldSend) {
      sent = await this.sendOutboundMessage(message.conversationId, decision.replyText, message.messageId);
      if (sent) {
        this.conversationCooldowns.set(message.conversationId, Date.now());
      }
    }

    writeJson(res, 200, {
      success: true,
      decision,
      sent,
    });
  }

  private async handleSendResult(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    const payload = await readJsonBody(req);
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      const record = payload as Record<string, unknown>;
      if (record.success === true) {
        this.status.lastOutboundAt = Date.now();
        this.status.lastError = null;
      } else if (typeof record.error === 'string' && record.error.trim()) {
        this.status.lastError = record.error.trim();
      }
    }
    writeJson(res, 200, { success: true });
  }

  private async processInboundMessage(
    message: WhatsAppInboundMessage,
    config: WhatsAppOpenClawConfig,
  ) {
    const prompt = buildWhatsAppStructuredPrompt(message, config.knowledgeRoot);
    const imMessage: IMMessage = {
      platform: 'whatsapp',
      messageId: message.messageId,
      conversationId: message.conversationId,
      senderId: message.senderName || message.conversationId,
      senderName: message.senderName || message.chatName || message.conversationId,
      groupName: message.chatName || message.conversationId,
      content: prompt,
      chatType: message.isGroup ? 'group' : 'direct',
      timestamp: Date.now(),
    };

    try {
      const rawReply = await this.processMessage(imMessage);
      return applyWhatsAppDecisionGuard(
        message,
        parseWhatsAppDecision(rawReply),
        {
          autoReplyGroups: config.autoReplyGroups,
          confidenceThreshold: config.confidenceThreshold,
          knowledgeRoot: config.knowledgeRoot,
          riskThreshold: config.riskThreshold,
        },
      );
    } catch (error) {
      const fallback = fallbackWhatsAppDecision(
        message,
        error instanceof Error ? error.message : 'Failed to parse WhatsApp decision.',
      );
      return applyWhatsAppDecisionGuard(
        message,
        fallback,
        {
          autoReplyGroups: config.autoReplyGroups,
          confidenceThreshold: config.confidenceThreshold,
          knowledgeRoot: config.knowledgeRoot,
          riskThreshold: config.riskThreshold,
        },
      );
    }
  }

  private hasSeenMessage(messageId: string): boolean {
    if (this.seenMessageIds.has(messageId)) {
      return true;
    }
    this.seenMessageIds.add(messageId);
    this.seenMessageQueue.push(messageId);
    if (this.seenMessageQueue.length > MAX_DEDUPE_ENTRIES) {
      const oldest = this.seenMessageQueue.shift();
      if (oldest) {
        this.seenMessageIds.delete(oldest);
      }
    }
    return false;
  }

  private isCoolingDown(conversationId: string, sendCooldownMs: number): boolean {
    const lastSentAt = this.conversationCooldowns.get(conversationId) || 0;
    return Date.now() - lastSentAt < Math.max(0, sendCooldownMs);
  }

  private async runWithConversationLock<T>(
    conversationId: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const previous = this.conversationLocks.get(conversationId) || Promise.resolve();
    let releaseCurrent!: () => void;
    const current = new Promise<void>((resolve) => {
      releaseCurrent = resolve;
    });
    this.conversationLocks.set(conversationId, current);
    await previous;
    try {
      return await operation();
    } finally {
      releaseCurrent();
      if (this.conversationLocks.get(conversationId) === current) {
        this.conversationLocks.delete(conversationId);
      }
    }
  }
}
