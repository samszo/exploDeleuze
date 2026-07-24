import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { env } from './env';

// Point d'entrée unique vers le LLM auto-hébergé (Ollama par défaut, ou tout
// autre serveur exposant une API compatible OpenAI /chat/completions).
const provider = createOpenAICompatible({
  name: 'self-hosted',
  baseURL: env.llm.baseUrl,
  apiKey: env.llm.apiKey,
});

export function getChatModel() {
  return provider(env.llm.model);
}
