const { randomUUID } = require('crypto');

// Mesma forma do jobStore.js (Map em memória + TTL) - aqui guardamos o
// histórico de mensagens de uma "conversa" de refinamento com a IA, não o
// status de um job. Nada disso toca banco: é só pra sobreviver enquanto a
// pessoa está na tela mexendo no diagrama.
const SESSION_TTL_MS = 60 * 60 * 1000; // 1h
const sessions = new Map();

// messages: [{ role: 'user'|'assistant', content: '...' }, ...] - normalmente
// o próprio prompt da primeira geração + a resposta da IA, pra qualquer
// refinamento subsequente já nascer com esse contexto. system fica fixo pra
// sessão inteira (mesma persona/regras em todos os turnos).
function createSession({ system, messages }) {
  const id = randomUUID();
  sessions.set(id, { id, system, messages: [...messages], createdAt: Date.now() });
  setTimeout(() => sessions.delete(id), SESSION_TTL_MS).unref();
  return id;
}

function getSession(id) {
  return sessions.get(id);
}

// Retorna null se a sessão não existe (expirada ou nunca existiu) - quem
// chama decide como tratar (normalmente: pedir pra gerar de novo).
function appendTurns(id, novasMensagens) {
  const sessao = sessions.get(id);
  if (!sessao) return null;
  sessao.messages.push(...novasMensagens);
  return sessao;
}

module.exports = { createSession, getSession, appendTurns };
