const pool = require('../../db');
const googleDocsService = require('../../service/googleDocsService');
const { chatJson, chatJsonConversation } = require('../../service/ai/claudeService');
const { renderMermaidToPng } = require('../../service/ai/mermaidRenderService');
const { createJob, updateJob, getJob } = require('../../service/ai/jobStore');
const { createSession, getSession, appendTurns } = require('../../service/ai/chatSessionStore');
const { validarSecao } = require('../../service/documentos/validarConteudoDocumento');
const { salvarDocumentoMermaid } = require('../../service/documentos/salvarDocumentoMermaid');
const {
  buildRequisitosPrompt,
  CHAT_REQUISITOS_SYSTEM,
  buildTurnoChatRequisitos,
  buildCasoDeUsoPrompt,
  buildTurnoRefinamentoDiagrama,
  buildDocumentoPrompt,
  buildDocumentoMermaidPrompt,
  formatRequisitoForApi,
  buildRetrabalhoPrompt,
  buscarSecaoPorCaminho,
} = require('../../service/ai/aiPrompts');

function montarTituloRequisito(requisito) {
  const codigo = requisito.codigo_requisito || '';
  const descricao = (requisito.descricao || '').trim();
  const trechoAntesDoisPontos = descricao.split(':')[0]?.trim();
  const tituloBase =
    trechoAntesDoisPontos && trechoAntesDoisPontos.length <= 90
      ? trechoAntesDoisPontos
      : 'Requisito';

  return codigo ? `${codigo} ${tituloBase}` : tituloBase;
}

function montarDescricaoRequisito(requisito) {
  return [requisito.descricao, requisito.observacoes && `Observacoes: ${requisito.observacoes}`]
    .filter(Boolean)
    .join('\n');
}

async function buscarRequisitosDoProjeto(projetoId) {
  const result = await pool.query(
    `SELECT
       r.id,
       rp.codigo_requisito,
       r.descricao,
       r.tipo,
       rp.prioridade,
       r.observacoes
     FROM requisitos_projeto rp
     JOIN requisitos r ON r.id = rp.requisito_id
     WHERE rp.projeto_id = $1
     ORDER BY rp.codigo_requisito NULLS LAST, r.id`,
    [projetoId]
  );

  return result.rows.map((requisito) => ({
    codigo: requisito.codigo_requisito,
    titulo: montarTituloRequisito(requisito),
    descricao: montarDescricaoRequisito(requisito),
    tipo: requisito.tipo || 'Funcional',
    prioridade: requisito.prioridade || 'Media',
  }));
}

exports.gerarRequisitos = async (req, res) => {
  try {
    const { escopo, nomeProjeto } = req.body;

    if (!escopo?.trim()) {
      return res.status(400).json({ error: 'Escopo é obrigatório.' });
    }

    const prompt = buildRequisitosPrompt({
      nomeProjeto: nomeProjeto || 'Novo Projeto',
      escopo: escopo.trim(),
    });

    const data = await chatJson({
      system: prompt.system,
      user: prompt.user,
      temperature: prompt.temperature,
      maxTokens: 8000,
    });

    const requisitos = (data.requisitos || []).map(formatRequisitoForApi);
    res.json(requisitos);
  } catch (error) {
    console.error('Erro IA Requisitos:', error);
    res.status(500).json({ error: error.message || 'Falha na IA ao gerar requisitos' });
  }
};

// Chat com memória sobre a lista de requisitos. Diferente do diagrama, aqui
// todo turno (o primeiro incluído) já é uma mensagem de chat - não existe
// separação entre "gerar" e "refinar", então um único endpoint decide se
// cria uma sessão nova (sem sessionId válido) ou continua uma existente.
// Reenvia a lista atual de requisitos a cada turno (ver
// buildTurnoChatRequisitos) em vez de confiar só na memória da sessão: a
// pessoa pode editar manualmente na tela entre uma mensagem e outra.
exports.chatRequisitos = async (req, res) => {
  try {
    const { sessionId, mensagem, nomeProjeto, escopo } = req.body;
    const requisitosAtuais = Array.isArray(req.body.requisitosAtuais) ? req.body.requisitosAtuais : [];

    if (!mensagem?.trim()) {
      return res.status(400).json({ error: 'mensagem é obrigatória.' });
    }

    const sessaoExistente = sessionId ? getSession(sessionId) : null;

    const turnoUsuario = {
      role: 'user',
      content: buildTurnoChatRequisitos({
        mensagem: mensagem.trim(),
        nomeProjeto: nomeProjeto || 'Novo Projeto',
        escopo,
        requisitosAtuais,
      }),
    };

    const historico = sessaoExistente ? [...sessaoExistente.messages, turnoUsuario] : [turnoUsuario];

    const data = await chatJsonConversation({
      system: CHAT_REQUISITOS_SYSTEM,
      messages: historico,
      temperature: 0.5,
      maxTokens: 6000,
    });

    const turnoAssistente = { role: 'assistant', content: JSON.stringify(data) };

    let sessionIdFinal = sessionId;
    if (sessaoExistente) {
      appendTurns(sessionId, [turnoUsuario, turnoAssistente]);
    } else {
      sessionIdFinal = createSession({ system: CHAT_REQUISITOS_SYSTEM, messages: [turnoUsuario, turnoAssistente] });
    }

    res.json({
      sessionId: sessionIdFinal,
      resposta_chat: data.resposta_chat || null,
      requisitos: (data.requisitos || []).map(formatRequisitoForApi),
    });
  } catch (error) {
    console.error('Erro IA Chat Requisitos:', error);
    res.status(500).json({ error: error.message || 'Falha na IA ao conversar sobre requisitos' });
  }
};

// Stateless: gera só um diagrama de casos de uso (Mermaid + SVG) a partir de
// requisitos ainda em memória no wizard do frontend - não recebe projetoId,
// não lê/grava nada no banco e não cria Google Doc. "Por enquanto" isso é só
// preview visual durante a criação do projeto (ver plano da feature).
exports.gerarDiagramaCasoDeUso = async (req, res) => {
  try {
    const { nomeProjeto, escopo } = req.body;
    const requisitos = Array.isArray(req.body.requisitos) ? req.body.requisitos : [];

    if (requisitos.length === 0) {
      return res.status(400).json({ error: 'Ao menos um requisito é necessário para gerar o diagrama.' });
    }

    const prompt = buildCasoDeUsoPrompt({
      nomeProjeto: nomeProjeto || 'Novo Projeto',
      escopo,
      requisitos,
    });

    const data = await chatJson({
      system: prompt.system,
      user: prompt.user,
      temperature: prompt.temperature,
      maxTokens: prompt.maxTokens,
    });

    let imagem_base64 = null;
    let aviso_renderizacao = null;
    try {
      imagem_base64 = await renderMermaidToPng(data.mermaid);
    } catch (renderError) {
      console.error('Erro ao renderizar Mermaid via mermaid.ink:', renderError);
      aviso_renderizacao = 'Não foi possível renderizar o diagrama visualmente agora. O código Mermaid ainda está disponível abaixo.';
    }

    // Sessão de conversa: semeada com o prompt original + a resposta da IA,
    // pra qualquer pedido de ajuste (refinarDiagramaCasoUso) já nascer com
    // esse contexto sem precisar reexplicar nada.
    const sessionId = createSession({
      system: prompt.system,
      messages: [
        { role: 'user', content: prompt.user },
        { role: 'assistant', content: JSON.stringify(data) },
      ],
    });

    res.json({
      sessionId,
      resposta_chat: data.resposta_chat || null,
      titulo: data.titulo || `Diagrama de Casos de Uso - ${nomeProjeto || 'Projeto'}`,
      atores: data.atores || [],
      mermaid: data.mermaid,
      imagem_base64,
      aviso_renderizacao,
    });
  } catch (error) {
    console.error('Erro IA Diagrama de Casos de Uso:', error);
    res.status(500).json({ error: error.message || 'Falha na IA ao gerar o diagrama de casos de uso' });
  }
};

// Pede um ajuste específico sobre um diagrama já gerado nesta sessão de
// conversa (ver createSession acima) - reenvia o histórico completo pro
// Claude (é assim que ele "lembra", já que não tem sessão própria) mais um
// turno novo com a instrução. Sessão desconhecida/expirada: erro claro,
// pedindo pra gerar de novo, em vez de tentar adivinhar um contexto.
exports.refinarDiagramaCasoUso = async (req, res) => {
  try {
    const { sessionId, instrucao } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId é obrigatório.' });
    }

    const sessao = getSession(sessionId);
    if (!sessao) {
      return res.status(400).json({
        error: 'Sessão expirada ou não encontrada. Clique em "Gerar novamente" para começar um novo diagrama.',
      });
    }

    const turnoUsuario = { role: 'user', content: buildTurnoRefinamentoDiagrama(instrucao) };

    const data = await chatJsonConversation({
      system: sessao.system,
      messages: [...sessao.messages, turnoUsuario],
      temperature: 0.4,
      maxTokens: 4000,
    });

    appendTurns(sessionId, [turnoUsuario, { role: 'assistant', content: JSON.stringify(data) }]);

    let imagem_base64 = null;
    let aviso_renderizacao = null;
    try {
      imagem_base64 = await renderMermaidToPng(data.mermaid);
    } catch (renderError) {
      console.error('Erro ao renderizar Mermaid via mermaid.ink:', renderError);
      aviso_renderizacao = 'Não foi possível renderizar o diagrama visualmente agora. O código Mermaid ainda está disponível abaixo.';
    }

    res.json({
      sessionId,
      resposta_chat: data.resposta_chat || null,
      titulo: data.titulo,
      atores: data.atores || [],
      mermaid: data.mermaid,
      imagem_base64,
      aviso_renderizacao,
    });
  } catch (error) {
    console.error('Erro IA Refinar Diagrama:', error);
    res.status(500).json({ error: error.message || 'Falha na IA ao refinar o diagrama' });
  }
};

exports.estimarOrcamento = async (req, res) => {
  try {
    const { nome, descricao, escopo, duracao_dias } = req.body;
    const equipe = Array.isArray(req.body.equipe) ? req.body.equipe : [];
    const recursos = Array.isArray(req.body.recursos) ? req.body.recursos : [];

    const prompt = `
      Atue como um Gerente de Projetos Sênior.
      Analise este projeto para estimar Orçamento e Complexidade.

      DADOS:
      - Projeto: ${nome}
      - Descrição: ${descricao}
      - Escopo Completo: ${escopo}
      - Duração: ${duracao_dias} dias
      - Equipe: ${equipe.length} pessoas (${equipe.map((e) => e.papel).join(', ')})
      - Recursos: ${recursos.length} itens

      Retorne JSON:
      {
        "orcamento_estimado": 0.00,
        "complexidade": "baixa, media ou alta"
      }
    `;

    const data = await chatJson({
      system: 'Responda apenas com JSON válido em português.',
      user: prompt,
      temperature: 0.3,
      maxTokens: 500,
    });

    const orcamentoNumerico = Number(data.orcamento_estimado);

    res.json({
      orcamento_estimado: Number.isFinite(orcamentoNumerico) ? orcamentoNumerico : 0.0,
      complexidade: data.complexidade || 'media',
    });
  } catch (error) {
    console.error('Erro IA Orçamento:', error);
    res.status(500).json({ error: 'Falha na IA' });
  }
};

async function processarGeracaoDocumento(jobId, { projetoId, tipoDocumento, tituloDocumento, descricaoExtra }) {
  updateJob(jobId, { stage: 'buscando_dados_do_projeto' });

  const projetoQuery = await pool.query('SELECT * FROM projetos WHERE id = $1', [projetoId]);
  const projeto = projetoQuery.rows[0];

  if (!projeto) {
    updateJob(jobId, { status: 'error', error: 'Projeto não encontrado' });
    return;
  }

  const requisitos = await buscarRequisitosDoProjeto(projetoId);

  const prompt = buildDocumentoPrompt({
    projeto,
    tipoDocumento,
    tituloDocumento,
    descricaoExtra,
    requisitos,
  });

  updateJob(jobId, { stage: 'gerando_conteudo_com_ia' });
  console.log('🤖 Gerando documento JSON com IA...');
  const documentoJson = await chatJson({
    system: prompt.system,
    user: prompt.user,
    temperature: prompt.temperature,
    maxTokens: prompt.maxTokens,
  });

  documentoJson.titulo = documentoJson.titulo || tituloDocumento;
  documentoJson.tipo_documento = documentoJson.tipo_documento || tipoDocumento;
  documentoJson.metadata = {
    ...(documentoJson.metadata || {}),
    projeto: projeto.nome_projeto,
  };

  updateJob(jobId, { stage: 'criando_documento_no_google_docs' });
  console.log('📄 Formatando Google Doc a partir do JSON...');
  const nomeArquivo = `${tituloDocumento} - ${projeto.nome_projeto}`;
  const docInfo = await googleDocsService.criarDocFromJson(nomeArquivo, documentoJson);

  const insertDoc = await pool.query(
    `INSERT INTO documentos (
      projeto_id, nome_do_arquivo, arquivo_url, tipo, descricao, data_criacao, conteudo_json
    )
    VALUES ($1, $2, $3, $4, $5, NOW(), $6)
    RETURNING *`,
    [
      projetoId,
      tituloDocumento,
      docInfo.link,
      tipoDocumento,
      'Documento gerado automaticamente pela IA (JSON estruturado)',
      JSON.stringify(documentoJson),
    ]
  );

  console.log('✅ Documento gerado e salvo!');

  updateJob(jobId, {
    status: 'done',
    result: {
      message: 'Documento gerado com sucesso!',
      documento: insertDoc.rows[0],
      googleDocId: docInfo.id,
    },
  });
}

// Formato "Diagrama Mermaid": mesma entrada (projeto + requisitos), mas em
// vez de montar um Google Doc a partir de secoes/tabelas, pede um diagrama
// Mermaid renderizado em PNG e grava direto no banco via
// salvarDocumentoMermaid - sem Google Docs, por decisão de produto.
async function processarGeracaoDocumentoMermaid(jobId, { projetoId, tipoDocumento, tituloDocumento, descricaoExtra }) {
  updateJob(jobId, { stage: 'buscando_dados_do_projeto' });

  const projetoQuery = await pool.query('SELECT * FROM projetos WHERE id = $1', [projetoId]);
  const projeto = projetoQuery.rows[0];

  if (!projeto) {
    updateJob(jobId, { status: 'error', error: 'Projeto não encontrado' });
    return;
  }

  const requisitos = await buscarRequisitosDoProjeto(projetoId);

  const prompt = buildDocumentoMermaidPrompt({ projeto, tipoDocumento, tituloDocumento, descricaoExtra, requisitos });

  updateJob(jobId, { stage: 'gerando_conteudo_com_ia' });
  console.log('🤖 Gerando diagrama Mermaid com IA...');
  const data = await chatJson({
    system: prompt.system,
    user: prompt.user,
    temperature: prompt.temperature,
    maxTokens: prompt.maxTokens,
  });

  updateJob(jobId, { stage: 'renderizando_diagrama' });
  let imagemBase64 = null;
  try {
    imagemBase64 = await renderMermaidToPng(data.mermaid);
  } catch (renderError) {
    console.error('Erro ao renderizar Mermaid via mermaid.ink:', renderError);
  }

  updateJob(jobId, { stage: 'salvando_documento' });
  const documento = await salvarDocumentoMermaid({
    projetoId,
    tipo: tipoDocumento,
    titulo: data.titulo || tituloDocumento,
    mermaid: data.mermaid,
    imagemBase64,
    atores: data.atores,
  });

  console.log('✅ Diagrama gerado e salvo!');

  updateJob(jobId, {
    status: 'done',
    result: { message: 'Documento gerado com sucesso!', documento },
  });
}

exports.gerarDocumentoIA = async (req, res) => {
  const { projetoId, tipoDocumento, tituloDocumento, descricaoExtra, formato } = req.body;

  if (!projetoId || !tipoDocumento || !tituloDocumento?.trim()) {
    return res.status(400).json({
      message: 'projetoId, tipoDocumento e tituloDocumento são obrigatórios.',
    });
  }

  const jobId = createJob();
  res.status(202).json({ jobId, status: 'processing' });

  const parametros = {
    projetoId,
    tipoDocumento,
    tituloDocumento: tituloDocumento.trim(),
    descricaoExtra,
  };

  const processar = formato === 'mermaid' ? processarGeracaoDocumentoMermaid : processarGeracaoDocumento;

  processar(jobId, parametros).catch((error) => {
    console.error('Erro ao gerar documento IA:', error);
    updateJob(jobId, { status: 'error', error: error.message || 'Falha na IA ao gerar documento' });
  });
};

// Reescreve com IA apenas a(s) seção(ões) indicadas por "caminho" (índice do
// array em cada nível de secoes/subsecoes), usando o resto do documento só
// como contexto estrutural (títulos, não o texto completo) — o custo/tempo
// dessa chamada escala com o que foi selecionado, não com o tamanho do
// documento inteiro. Não toca no banco: opera sobre o JSON que o cliente já
// tem em memória (inclusive edições ainda não salvas) e devolve só as
// seções reescritas; salvar continua sendo uma ação separada do usuário.
async function processarRetrabalhoSecoes(jobId, { documento, caminhos, instrucao }) {
  updateJob(jobId, { stage: 'gerando_reescrita_com_ia' });

  const prompt = buildRetrabalhoPrompt({ documento, caminhos, instrucao });

  const data = await chatJson({
    system: prompt.system,
    user: prompt.user,
    temperature: prompt.temperature,
    maxTokens: prompt.maxTokens,
  });

  const secoesRetornadas = Array.isArray(data.secoes) ? data.secoes : [];

  for (const item of secoesRetornadas) {
    const erro = validarSecao(item.secao, `secoes[caminho=${JSON.stringify(item.caminho)}]`);
    if (erro) {
      updateJob(jobId, { status: 'error', error: `A IA retornou uma seção inválida: ${erro}` });
      return;
    }
  }

  updateJob(jobId, {
    status: 'done',
    result: { secoes: secoesRetornadas },
  });
}

exports.retrabalharSecoes = async (req, res) => {
  const { documento, caminhos, instrucao } = req.body;

  if (!documento || !Array.isArray(documento.secoes)) {
    return res.status(400).json({ message: 'documento (com secoes) é obrigatório.' });
  }

  if (!Array.isArray(caminhos) || caminhos.length === 0) {
    return res.status(400).json({ message: 'Selecione ao menos uma seção para retrabalhar.' });
  }

  for (const caminho of caminhos) {
    if (!Array.isArray(caminho) || caminho.some((indice) => !Number.isInteger(indice) || indice < 0)) {
      return res.status(400).json({ message: `Caminho inválido: ${JSON.stringify(caminho)}` });
    }
    if (!buscarSecaoPorCaminho(documento.secoes, caminho)) {
      return res.status(400).json({ message: `Seção não encontrada no caminho ${JSON.stringify(caminho)}` });
    }
  }

  const jobId = createJob();
  res.status(202).json({ jobId, status: 'processing' });

  processarRetrabalhoSecoes(jobId, { documento, caminhos, instrucao }).catch((error) => {
    console.error('Erro ao retrabalhar seções com IA:', error);
    updateJob(jobId, { status: 'error', error: error.message || 'Falha na IA ao retrabalhar seções' });
  });
};

// Genérico: consulta o status de qualquer job de IA (geração de documento ou
// retrabalho de seções), já que o jobStore não distingue a origem.
exports.statusJob = (req, res) => {
  const job = getJob(req.params.jobId);

  if (!job) {
    return res.status(404).json({ error: 'Job não encontrado ou expirado' });
  }

  res.json(job);
};
