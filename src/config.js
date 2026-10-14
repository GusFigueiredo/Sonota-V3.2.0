import path from 'node:path';
import { fileURLToPath } from 'node:url';
export const ROOT = fileURLToPath(new URL('../', import.meta.url));
const integer = (value, fallback, min, max) => {
  const n = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error('Configuração numérica inválida no .env.');
  return n;
};
export function getConfig(overrides = {}) {
  const port = integer(process.env.PORT, 3000, 1, 65535);
  return {
    port, host: process.env.HOST || '127.0.0.1',
    dataDir: path.resolve(ROOT, process.env.DATA_DIR || 'data'),
    publicDir: path.join(ROOT, 'public'),
    origins: (process.env.APP_ORIGINS || `http://localhost:${port},http://127.0.0.1:${port}`).split(',').map(x => x.trim()).filter(Boolean),
    secureCookie: process.env.COOKIE_SECURE === 'true',
    registration: process.env.ALLOW_REGISTRATION !== 'false',
    maxFileBytes: integer(process.env.MAX_UPLOAD_MB, 100, 1, 1024) * 1024 * 1024,
    quotaBytes: integer(process.env.USER_STORAGE_MB, 2048, 1, 102400) * 1024 * 1024,
    sessionHours: integer(process.env.SESSION_HOURS, 24, 1, 720),
    audioEnabled: process.env.AUDIO_ENABLED === 'true',
    python: process.env.AUDIO_PYTHON || (process.platform === 'win32' ? 'python' : 'python3'),
    jobTimeoutMs: integer(process.env.AUDIO_TIMEOUT_SECONDS, 1800, 10, 14400) * 1000,
    // # IA local Sonota (Ollama)
    aiEnabled: process.env.AI_ENABLED === 'true',
    ollamaUrl: process.env.OLLAMA_URL || '',
    agentModel: process.env.AGENT_MODEL || 'qwen3:1.7b',
    embeddingModel: process.env.EMBEDDING_MODEL || 'qwen3-embedding:0.6b',
    aiMaxSteps: integer(process.env.AI_MAX_STEPS, 3, 1, 12),
    aiMemoryMessages: integer(process.env.AI_MEMORY_MESSAGES, 4, 2, 40),
    aiTimeoutMs: integer(process.env.AI_TIMEOUT_SECONDS, 180, 5, 900) * 1000,
    aiThinking: process.env.AI_THINKING === 'true',
    // # Modo rápido para CRUD e consultas simples
    // Usa o mesmo Qwen 1.7B em dois perfis: FAST para uma inferência curta e AGENT
    // apenas quando o pedido realmente exige tools em várias etapas.
    aiFastEnabled: process.env.AI_FAST_ENABLED !== 'false',
    aiFastModel: process.env.AI_FAST_MODEL || 'qwen3:1.7b',
    aiFastTimeoutMs: integer(process.env.AI_FAST_TIMEOUT_SECONDS, 60, 5, 300) * 1000,
    aiFastContext: integer(process.env.AI_FAST_CONTEXT, 1536, 512, 16384),
    aiFastPredict: integer(process.env.AI_FAST_NUM_PREDICT, 128, 32, 1024),
    aiAgentContext: integer(process.env.AI_AGENT_CONTEXT, 3072, 1024, 32768),
    aiAgentPredict: integer(process.env.AI_AGENT_NUM_PREDICT, 192, 64, 2048),
    aiKeepAlive: process.env.AI_KEEP_ALIVE || '1h',
    aiTemperature: Number.isFinite(Number(process.env.AI_TEMPERATURE)) ? Number(process.env.AI_TEMPERATURE) : 0,
    aiWarmup: process.env.AI_WARMUP !== 'false',
    aiWarmupEmbedding: process.env.AI_WARMUP_EMBEDDING !== 'false',
    aiWarmupTimeoutMs: integer(process.env.AI_WARMUP_TIMEOUT_SECONDS, 120, 5, 600) * 1000,
    ...overrides
  };
}
