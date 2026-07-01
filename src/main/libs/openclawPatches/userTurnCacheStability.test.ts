import { describe, test } from 'vitest';

import { expectPatchContains } from './patchTestUtils';

describe('OpenClaw user-turn prompt cache stability patch', () => {
  test('carries the v6.1 backport for byte-stable current and historical user turns', () => {
    expectPatchContains('openclaw-user-turn-cache-stability.patch', [
      'canonicalizeTextOnlyUserContent',
      'stampUserTextWithMessageTimestamp',
      'currentUserTimestampOverride',
      'BodyForAgent: messageForAgent',
      'prompt-cache byte-identity',
      'turn1AsCurrent',
      'turn1AsHistorical',
    ]);
  });

});
