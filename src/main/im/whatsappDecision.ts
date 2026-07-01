import path from 'path';

const JSON_CODE_FENCE_RE = /^```(?:json)?\s*|\s*```$/g;
const PRICE_PATTERN_RE = /\b(price|pricing|quote|quotation|cost|usd|fob|cif|cnf|多少钱|价格|报价|费用)\b/i;
const INVENTORY_PATTERN_RE = /\b(stock|inventory|available|availability|现货|库存|在库)\b/i;

export const WhatsAppDecisionAction = {
  Reply: 'reply',
  Clarify: 'clarify',
  Handoff: 'handoff',
  Ignore: 'ignore',
} as const;

export type WhatsAppDecisionAction =
  typeof WhatsAppDecisionAction[keyof typeof WhatsAppDecisionAction];

export const WhatsAppRiskFlag = {
  Price: 'price',
  Inventory: 'inventory',
  ParseError: 'parse_error',
  MissingEvidence: 'missing_evidence',
  LowConfidence: 'low_confidence',
  GroupChat: 'group_chat',
} as const;

export type WhatsAppRiskFlag =
  typeof WhatsAppRiskFlag[keyof typeof WhatsAppRiskFlag];

export interface WhatsAppInboundMessage {
  platform: 'whatsapp';
  conversationId: string;
  messageId: string;
  chatName?: string;
  senderName?: string;
  direction: 'incoming' | 'outgoing';
  isGroup: boolean;
  content: string;
  capturedAt: string;
  raw?: unknown;
}

export interface WhatsAppDecision {
  action: WhatsAppDecisionAction;
  replyText: string;
  reason: string;
  confidence: number;
  citations: string[];
  riskFlags: WhatsAppRiskFlag[];
  missingFields: string[];
}

export interface WhatsAppGuardOptions {
  autoReplyGroups: boolean;
  confidenceThreshold: number;
  knowledgeRoot: string;
  riskThreshold: number;
}

const DEFAULT_MISSING_FIELDS = [
  'model',
  'quantity',
  'destination country or port',
  'new or used preference',
];

const normalizeJson = (value: string): string => {
  return value.trim().replace(JSON_CODE_FENCE_RE, '').trim();
};

const normalizeStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(Boolean);
};

const normalizeConfidence = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
};

const normalizeAction = (value: unknown): WhatsAppDecisionAction => {
  const text = typeof value === 'string' ? value.trim().toLowerCase() : '';
  switch (text) {
    case WhatsAppDecisionAction.Reply:
    case WhatsAppDecisionAction.Clarify:
    case WhatsAppDecisionAction.Handoff:
    case WhatsAppDecisionAction.Ignore:
      return text;
    default:
      return WhatsAppDecisionAction.Handoff;
  }
};

const includesStaticKnowledgeCitation = (
  citations: string[],
  knowledgeRoot: string,
): boolean => {
  const normalizedRoot = knowledgeRoot.trim();
  if (!normalizedRoot) return citations.length > 0;
  return citations.some((citation) => {
    const normalized = citation.replace(/\\/g, '/').trim();
    return normalized.startsWith(normalizedRoot.replace(/\\/g, '/'))
      || normalized.startsWith(path.basename(normalizedRoot));
  });
};

export function parseWhatsAppDecision(rawText: string): WhatsAppDecision {
  const normalized = normalizeJson(rawText);
  if (!normalized) {
    throw new Error('WhatsApp decision output is empty');
  }

  const parsed = JSON.parse(normalized) as Record<string, unknown>;
  return {
    action: normalizeAction(parsed.action),
    replyText: typeof parsed.replyText === 'string' ? parsed.replyText.trim() : '',
    reason: typeof parsed.reason === 'string' ? parsed.reason.trim() : '',
    confidence: normalizeConfidence(parsed.confidence),
    citations: normalizeStringArray(parsed.citations),
    riskFlags: normalizeStringArray(parsed.riskFlags) as WhatsAppRiskFlag[],
    missingFields: normalizeStringArray(parsed.missingFields),
  };
}

export function fallbackWhatsAppDecision(
  message: WhatsAppInboundMessage,
  reason: string,
): WhatsAppDecision {
  const content = message.content.trim();
  const needsRiskClarification =
    PRICE_PATTERN_RE.test(content) || INVENTORY_PATTERN_RE.test(content);
  return {
    action: needsRiskClarification
      ? WhatsAppDecisionAction.Clarify
      : WhatsAppDecisionAction.Handoff,
    replyText: needsRiskClarification
      ? 'To help accurately, please share the model, quantity, destination port, and whether you need new or used vehicles.'
      : '',
    reason,
    confidence: 0,
    citations: [],
    riskFlags: [WhatsAppRiskFlag.ParseError],
    missingFields: needsRiskClarification ? [...DEFAULT_MISSING_FIELDS] : [],
  };
}

export function applyWhatsAppDecisionGuard(
  message: WhatsAppInboundMessage,
  decision: WhatsAppDecision,
  options: WhatsAppGuardOptions,
): WhatsAppDecision {
  const next: WhatsAppDecision = {
    ...decision,
    citations: [...decision.citations],
    riskFlags: [...decision.riskFlags],
    missingFields: [...decision.missingFields],
  };

  if (message.isGroup && !options.autoReplyGroups) {
    next.action = WhatsAppDecisionAction.Ignore;
    next.replyText = '';
    next.reason = next.reason || 'Group auto reply is disabled.';
    if (!next.riskFlags.includes(WhatsAppRiskFlag.GroupChat)) {
      next.riskFlags.push(WhatsAppRiskFlag.GroupChat);
    }
    return next;
  }

  if (next.confidence < options.confidenceThreshold) {
    next.action = WhatsAppDecisionAction.Handoff;
    next.replyText = '';
    if (!next.riskFlags.includes(WhatsAppRiskFlag.LowConfidence)) {
      next.riskFlags.push(WhatsAppRiskFlag.LowConfidence);
    }
    return next;
  }

  const hasMaterialRisk = next.riskFlags.some((flag) => {
    return flag !== WhatsAppRiskFlag.GroupChat && flag !== WhatsAppRiskFlag.ParseError;
  });
  if (hasMaterialRisk && next.confidence < options.riskThreshold) {
    next.action = next.action === WhatsAppDecisionAction.Clarify
      ? WhatsAppDecisionAction.Clarify
      : WhatsAppDecisionAction.Handoff;
    if (next.action === WhatsAppDecisionAction.Handoff) {
      next.replyText = '';
    }
    next.reason = next.reason || 'Risk review requires higher confidence before auto send.';
    if (!next.riskFlags.includes(WhatsAppRiskFlag.LowConfidence)) {
      next.riskFlags.push(WhatsAppRiskFlag.LowConfidence);
    }
    return next;
  }

  const text = message.content.trim();
  const asksPrice = PRICE_PATTERN_RE.test(text);
  const asksInventory = INVENTORY_PATTERN_RE.test(text);
  const hasStaticEvidence = includesStaticKnowledgeCitation(next.citations, options.knowledgeRoot);

  if ((asksPrice || asksInventory) && !hasStaticEvidence) {
    next.action = WhatsAppDecisionAction.Clarify;
    next.replyText = next.replyText
      || 'Please share the model, quantity, destination port, and whether you need new or used vehicles so I can check the right details.';
    next.reason = next.reason || 'Static knowledge evidence is required for price or inventory replies.';
    if (!next.riskFlags.includes(WhatsAppRiskFlag.MissingEvidence)) {
      next.riskFlags.push(WhatsAppRiskFlag.MissingEvidence);
    }
    if (asksPrice && !next.riskFlags.includes(WhatsAppRiskFlag.Price)) {
      next.riskFlags.push(WhatsAppRiskFlag.Price);
    }
    if (asksInventory && !next.riskFlags.includes(WhatsAppRiskFlag.Inventory)) {
      next.riskFlags.push(WhatsAppRiskFlag.Inventory);
    }
    if (next.missingFields.length === 0) {
      next.missingFields = [...DEFAULT_MISSING_FIELDS];
    }
  }

  return next;
}

export function buildWhatsAppStructuredPrompt(
  message: WhatsAppInboundMessage,
  knowledgeRoot: string,
): string {
  const knowledgePath = knowledgeRoot.trim() || 'sales-kb';
  return [
    'You are handling an inbound WhatsApp sales inquiry.',
    'Reply with JSON only. Do not include markdown, explanations, or code fences.',
    'Required JSON schema:',
    '{"action":"reply|clarify|handoff|ignore","replyText":"string","reason":"string","confidence":0.0,"citations":["string"],"riskFlags":["string"],"missingFields":["string"]}',
    'Rules:',
    '- Keep replyText concise and suitable for direct WhatsApp sending.',
    '- Do not invent price, inventory, lead time, shipping, or legal guarantees.',
    `- Use static knowledge from ${knowledgePath} when available and cite the source path in citations.`,
    '- If evidence is missing for price or inventory, prefer action="clarify" or action="handoff".',
    '- If the message is casual and safe to answer, action="reply" is acceptable.',
    `Chat name: ${message.chatName || 'Unknown'}`,
    `Sender name: ${message.senderName || 'Unknown'}`,
    `Is group chat: ${message.isGroup ? 'yes' : 'no'}`,
    `Customer message:\n${message.content}`,
  ].join('\n');
}
