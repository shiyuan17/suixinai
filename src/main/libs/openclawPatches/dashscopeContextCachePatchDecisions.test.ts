import { describe, test } from 'vitest';

import { expectPatchContains } from './patchTestUtils';

describe('OpenAI-compatible explicit context cache OpenClaw patch decisions', () => {
  test('keeps explicit context cache eligibility and payload coverage', () => {
    expectPatchContains('openclaw-dashscope-context-cache.patch', [
      'contextCacheProvider: "dashscope"',
      'contextCacheProvider: "anthropic-compatible"',
      'contextCacheMode: "explicit"',
      'resolveCacheRetention',
      'resolveExplicitContextCacheStreamParams',
      'applyOpenAICompletionsExplicitContextCache',
      '[ExplicitCachePassThrough]',
      '[ExplicitCachePayload]',
      '********************',
      'adds Anthropic cache_control markers for OpenAI-compatible explicit context cache',
      'cache_control: { type: "ephemeral" }',
      'not OpenAI prompt_cache_key',
    ]);
  });

});
