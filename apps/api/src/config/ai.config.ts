import { registerAs } from '@nestjs/config';

export default registerAs('ai', () => {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  const rawProvider = (process.env.AI_PROVIDER || '').trim().toLowerCase();

  // Smart provider resolution:
  // 1. If explicit non-gemini provider requested ('stub', 'openai', 'anthropic'), respect it.
  // 2. If user provides GEMINI_API_KEY, automatically activate 'gemini' so simply pasting
  //    the key in .env works immediately without needing to touch any other settings.
  // 3. If no key and no provider specified, default safely to 'stub'.
  let provider = 'stub';
  if (rawProvider === 'openai' || rawProvider === 'anthropic' || rawProvider === 'stub') {
    provider = rawProvider;
  } else if (apiKey || rawProvider === 'gemini') {
    provider = apiKey ? 'gemini' : 'stub';
  }

  return {
    provider,
    geminiApiKey: apiKey,
    // Free tier allows 15 req/min (4000ms minimum spacing).
    geminiDelayMs: parseInt(process.env.GEMINI_DELAY_MS || '4000', 10),
    // Use Google's official stable flash alias as default
    geminiModel: process.env.GEMINI_MODEL || 'gemini-flash-latest',
  };
});
