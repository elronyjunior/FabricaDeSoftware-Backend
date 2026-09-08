const Anthropic = require('@anthropic-ai/sdk');
const { claudeApiKey, claudeModel } = require('../../config/env');
const { parseJsonFromAi } = require('./jsonParser');

const anthropic = new Anthropic({ apiKey: claudeApiKey });

async function requestOnce({ system, messages, temperature, maxTokens }) {
  console.log('🚀 Iniciando requisição (streaming) para a API do Claude...');
  console.time('⏳ Tempo total da API do Claude');
  const stream = anthropic.messages.stream({
    model: claudeModel,
    temperature,
    max_tokens: maxTokens,
    system,
    messages,
  });
  const response = await stream.finalMessage();
  console.timeEnd('⏳ Tempo total da API do Claude');

  const content = response.content[0]?.text;
  console.log(`📊 Tamanho da resposta bruta do Claude: ${content ? content.length : 0} caracteres`);

  if (response.stop_reason === 'max_tokens') {
    console.warn('⚠️  Resposta da IA truncada (max_tokens atingido). Tentando reparar JSON...');
  }

  return content;
}

async function streamAndParse({ system, messages, temperature, maxTokens }) {
  if (!claudeApiKey) {
    throw new Error('Claude_API não configurada no .env');
  }

  const content = await requestOnce({ system, messages, temperature, maxTokens });

  try {
    return parseJsonFromAi(content);
  } catch (parseError) {
    // Às vezes o modelo devolve um JSON internamente inválido (ex: aspas não
    // escapadas no meio de uma string) - não é truncamento, então o reparo
    // de parseJsonFromAi não ajuda. Uma segunda tentativa do zero costuma
    // resolver, já que é variação de amostragem, não um erro determinístico
    // do prompt. Só tentamos uma vez a mais - se falhar de novo, propaga.
    console.warn('⚠️  JSON da IA malformado mesmo após reparo, tentando novamente do zero:', parseError.message);
    const retryContent = await requestOnce({ system, messages, temperature, maxTokens });
    return parseJsonFromAi(retryContent);
  }
}

async function chatJson({ system, user, temperature = 0.4, maxTokens = 16000 }) {
  return streamAndParse({
    system,
    messages: [{ role: 'user', content: user }],
    temperature,
    maxTokens,
  });
}

// Igual a chatJson, mas aceita o histórico completo da conversa (várias
// mensagens user/assistant) em vez de um único turno. O Claude não tem
// sessão própria - "lembrar" significa reenviar tudo que já foi dito a cada
// chamada. Quem monta e guarda esse histórico é o chamador (ver
// chatSessionStore.js); esta função só fala com a API.
async function chatJsonConversation({ system, messages, temperature = 0.4, maxTokens = 16000 }) {
  return streamAndParse({ system, messages, temperature, maxTokens });
}

module.exports = { chatJson, chatJsonConversation };
