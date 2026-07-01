import { expect, test } from 'vitest';

import {
  applyWhatsAppDecisionGuard,
  fallbackWhatsAppDecision,
  parseWhatsAppDecision,
  WhatsAppDecisionAction,
  type WhatsAppInboundMessage,
  WhatsAppRiskFlag,
} from './whatsappDecision';

const baseMessage: WhatsAppInboundMessage = {
  platform: 'whatsapp',
  conversationId: '12345@c.us',
  messageId: 'msg-1',
  chatName: 'Alice',
  senderName: 'Alice',
  direction: 'incoming',
  isGroup: false,
  content: 'Hello, can you share a quote for BYD Atto 3?',
  capturedAt: '2026-06-16T00:00:00.000Z',
};

test('parseWhatsAppDecision accepts fenced JSON', () => {
  const decision = parseWhatsAppDecision(`\`\`\`json
{"action":"reply","replyText":"Hello","reason":"safe","confidence":0.9,"citations":["sales-kb/faq.md"],"riskFlags":[],"missingFields":[]}
\`\`\``);

  expect(decision.action).toBe(WhatsAppDecisionAction.Reply);
  expect(decision.replyText).toBe('Hello');
  expect(decision.citations).toEqual(['sales-kb/faq.md']);
});

test('fallbackWhatsAppDecision asks for missing sales details on price questions', () => {
  const decision = fallbackWhatsAppDecision(baseMessage, 'parse failed');

  expect(decision.action).toBe(WhatsAppDecisionAction.Clarify);
  expect(decision.riskFlags).toContain(WhatsAppRiskFlag.ParseError);
  expect(decision.missingFields).toContain('model');
});

test('applyWhatsAppDecisionGuard ignores group chat when group auto reply is disabled', () => {
  const decision = applyWhatsAppDecisionGuard(
    { ...baseMessage, isGroup: true },
    {
      action: WhatsAppDecisionAction.Reply,
      replyText: 'Hello',
      reason: 'safe',
      confidence: 0.95,
      citations: ['sales-kb/faq.md'],
      riskFlags: [],
      missingFields: [],
    },
    {
      autoReplyGroups: false,
      confidenceThreshold: 0.65,
      knowledgeRoot: 'sales-kb',
      riskThreshold: 0.8,
    },
  );

  expect(decision.action).toBe(WhatsAppDecisionAction.Ignore);
  expect(decision.riskFlags).toContain(WhatsAppRiskFlag.GroupChat);
});

test('applyWhatsAppDecisionGuard clarifies price requests without static evidence', () => {
  const decision = applyWhatsAppDecisionGuard(
    baseMessage,
    {
      action: WhatsAppDecisionAction.Reply,
      replyText: 'USD 20,000 FOB.',
      reason: 'answering directly',
      confidence: 0.9,
      citations: [],
      riskFlags: [],
      missingFields: [],
    },
    {
      autoReplyGroups: false,
      confidenceThreshold: 0.65,
      knowledgeRoot: 'sales-kb',
      riskThreshold: 0.8,
    },
  );

  expect(decision.action).toBe(WhatsAppDecisionAction.Clarify);
  expect(decision.riskFlags).toContain(WhatsAppRiskFlag.Price);
  expect(decision.riskFlags).toContain(WhatsAppRiskFlag.MissingEvidence);
});

test('applyWhatsAppDecisionGuard hands off risky replies below the risk threshold', () => {
  const decision = applyWhatsAppDecisionGuard(
    { ...baseMessage, content: 'Do you have this model in stock?' },
    {
      action: WhatsAppDecisionAction.Reply,
      replyText: 'Yes, it is available.',
      reason: 'inventory answer',
      confidence: 0.6,
      citations: ['sales-kb/faq.md'],
      riskFlags: [WhatsAppRiskFlag.Inventory],
      missingFields: [],
    },
    {
      autoReplyGroups: false,
      confidenceThreshold: 0.5,
      knowledgeRoot: 'sales-kb',
      riskThreshold: 0.75,
    },
  );

  expect(decision.action).toBe(WhatsAppDecisionAction.Handoff);
  expect(decision.replyText).toBe('');
  expect(decision.riskFlags).toContain(WhatsAppRiskFlag.LowConfidence);
});
