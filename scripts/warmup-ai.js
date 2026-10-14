import { getConfig } from '../src/config.js';
import { ollamaStatus,warmupEmbedding,warmupModel } from '../src/ai/ollama.js';

// # Warm-up executado pelo Iniciar-Sonota.bat
// Mantém o custo da primeira mensagem fora da experiência do usuário.
const config=getConfig();
if(!config.aiEnabled||!config.aiWarmup){
  console.log('[IA] Aquecimento desativado.');
  process.exit(0);
}

const status=await ollamaStatus(config);
if(!status.available){
  console.log('[IA] Ollama não está acessível. O Sonota continuará com o modo compatível.');
  process.exit(0);
}
if(!status.models?.some(name=>name===config.aiFastModel||name.startsWith(`${config.aiFastModel}:`))){
  console.log(`[IA] Modelo rápido ${config.aiFastModel} não encontrado. Execute Configurar-IA-Sonota.bat.`);
  process.exit(0);
}

if(config.aiWarmupEmbedding){
  console.log(`[IA] Preparando embeddings ${config.embeddingModel}...`);
  const embed=await warmupEmbedding(config);
  if(embed.ok)console.log(`[IA] Embeddings prontos em ${(embed.ms/1000).toFixed(1)}s.`);
  else console.log(`[IA] Não foi possível aquecer embeddings (${embed.error||embed.reason}).`);
}

console.log(`[IA] Preparando Qwen ${config.aiFastModel}...`);
const result=await warmupModel(config,config.aiFastModel);
if(result.ok)console.log(`[IA] Qwen pronto em ${(result.ms/1000).toFixed(1)}s e mantido carregado por ${config.aiKeepAlive}.`);
else console.log(`[IA] Não foi possível aquecer o Qwen (${result.error||result.reason}). O Sonota ainda pode tentar carregá-lo na primeira mensagem.`);
