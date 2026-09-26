import { registerAs } from '@nestjs/config';

export default registerAs('ai', () => ({
  provider: process.env.AI_PROVIDER || 'stub',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  // Gemini free-tier: 15 requests/minute → enforce a minimum delay between calls
  geminiDelayMs: parseInt(process.env.GEMINI_DELAY_MS || '4500', 10),
  geminiModel: process.env.GEMINI_MODEL || 'gemini-3.5-flash',
}));
