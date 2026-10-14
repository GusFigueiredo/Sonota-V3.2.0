import { createApp } from './app.js';
import { warmupEmbedding,warmupModel } from './ai/ollama.js';
if(Number(process.versions.node.split('.')[0])!==24)throw new Error('Use Node.js 24 LTS para executar este projeto.');
const runtime=createApp();
const server=runtime.app.listen(runtime.config.port,runtime.config.host,()=>{
 console.log(`Sonota pronto em http://localhost:${runtime.config.port}`);
 console.log('Crie sua conta na tela de acesso. Ctrl+C encerra o servidor.');
 // # Warm-up não bloqueante
 // Quem iniciar por `npm start` (sem o .bat) também recebe o benefício do modelo FAST
 // pré-carregado. Se o Ollama estiver fora do ar, o servidor continua normalmente.
 if(runtime.config.aiEnabled&&runtime.config.aiWarmup){
   (async()=>{
     // O embedding aquece primeiro; o Qwen de conversa fica por último e tende a permanecer
     // residente para a primeira mensagem do Assistente.
     if(runtime.config.aiWarmupEmbedding){
       const embed=await warmupEmbedding(runtime.config);
       if(embed.ok)console.log(`[sonota-ai] Embeddings prontos: ${embed.model} (${(embed.ms/1000).toFixed(1)}s).`);
       else console.warn('[sonota-ai] Warm-up de embeddings não concluído:',embed.error||embed.reason);
     }
     const result=await warmupModel(runtime.config,runtime.config.aiFastModel);
     if(result.ok)console.log(`[sonota-ai] Qwen pronto: ${result.model} (${(result.ms/1000).toFixed(1)}s).`);
     else console.warn('[sonota-ai] Warm-up do Qwen não concluído:',result.error||result.reason);
   })().catch(error=>console.warn('[sonota-ai] Warm-up não concluído:',error.message));
 }
});
// # A V3.2.0 usa o modelo 1.7B também no agente; 4 minutos ainda dão margem a PCs modestos.
server.requestTimeout=240000;
server.on('error',async error=>{console.error('Não foi possível iniciar o Sonota:',error.message);await runtime.close();process.exitCode=1;});
let closing=false;
async function stop(){if(closing)return;closing=true;server.close(async()=>{await runtime.close();});server.closeIdleConnections();}
process.once('SIGINT',stop);process.once('SIGTERM',stop);
