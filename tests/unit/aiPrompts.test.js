const {
  buildRequisitosPrompt,
  buildTurnoChatRequisitos,
  buildCasoDeUsoPrompt,
  buildTurnoRefinamentoDiagrama,
  buildDocumentoPrompt,
  buildDocumentoMermaidPrompt,
  formatRequisitoForApi,
  buildRetrabalhoPrompt,
  buscarSecaoPorCaminho,
} = require('../../service/ai/aiPrompts');

describe('buildRequisitosPrompt', () => {
  it('inclui nome do projeto e escopo no prompt do usuário', () => {
    const prompt = buildRequisitosPrompt({ nomeProjeto: 'Sistema X', escopo: 'Gestão de estoque' });

    expect(prompt.user).toContain('Sistema X');
    expect(prompt.user).toContain('Gestão de estoque');
    expect(prompt.system).toMatch(/JSON válido/);
    expect(prompt.temperature).toBe(0.5);
  });
});

describe('buildCasoDeUsoPrompt', () => {
  const requisitos = [
    { titulo: 'Login', descricao: 'Permitir login com email e senha', tipo: 'Funcional' },
    { titulo: 'Tempo de resposta', descricao: 'Responder em até 2s', tipo: 'Não Funcional' },
  ];

  it('separa requisitos funcionais e não funcionais em blocos distintos', () => {
    const prompt = buildCasoDeUsoPrompt({ nomeProjeto: 'Sistema X', escopo: 'Gestão de estoque', requisitos });

    expect(prompt.user).toContain('REQUISITOS FUNCIONAIS');
    expect(prompt.user).toContain('REQUISITOS NÃO FUNCIONAIS');
    expect(prompt.user).toContain('Login: Permitir login com email e senha');
    expect(prompt.user).toContain('Tempo de resposta: Responder em até 2s');
  });

  it('instrui a usar flowchart em vez de usecaseDiagram', () => {
    const prompt = buildCasoDeUsoPrompt({ nomeProjeto: 'Sistema X', escopo: '', requisitos });

    expect(prompt.user).toContain('flowchart LR');
    expect(prompt.user).toContain('não use "usecaseDiagram"');
  });

  it('avisa quando não há requisitos funcionais', () => {
    const prompt = buildCasoDeUsoPrompt({
      nomeProjeto: 'Sistema X',
      escopo: '',
      requisitos: [{ titulo: 'Tempo de resposta', descricao: 'Responder em até 2s', tipo: 'Não Funcional' }],
    });

    expect(prompt.user).toContain('Nenhum requisito funcional informado.');
  });

  it('omite a seção de escopo quando ele não é informado', () => {
    const prompt = buildCasoDeUsoPrompt({ nomeProjeto: 'Sistema X', escopo: '', requisitos });
    expect(prompt.user).not.toContain('Escopo: """');
  });
});

describe('buildTurnoChatRequisitos', () => {
  it('inclui a lista atual de requisitos e a mensagem da pessoa', () => {
    const turno = buildTurnoChatRequisitos({
      mensagem: 'Adicione um requisito de autenticação por token',
      nomeProjeto: 'Sistema X',
      escopo: 'Gestão de estoque',
      requisitosAtuais: [{ titulo: 'Login', descricao: 'Permitir login', tipo: 'Funcional' }],
    });

    expect(turno).toContain('Login: Permitir login');
    expect(turno).toContain('Adicione um requisito de autenticação por token');
    expect(turno).toContain('resposta_chat');
  });

  it('avisa quando não há requisitos cadastrados ainda', () => {
    const turno = buildTurnoChatRequisitos({
      mensagem: 'Gere 3 requisitos iniciais',
      nomeProjeto: 'Sistema X',
      escopo: '',
      requisitosAtuais: [],
    });

    expect(turno).toContain('(nenhum requisito cadastrado ainda)');
  });
});

describe('buildTurnoRefinamentoDiagrama', () => {
  it('inclui a instrução do usuário no turno', () => {
    const turno = buildTurnoRefinamentoDiagrama('remova o ator Cliente');
    expect(turno).toContain('remova o ator Cliente');
    expect(turno).toContain('diagrama COMPLETO atualizado');
  });

  it('usa uma instrução padrão quando o usuário não escreve nada', () => {
    const turno = buildTurnoRefinamentoDiagrama('');
    expect(turno).toContain('Revise e melhore o diagrama atual.');
  });
});

describe('buildDocumentoMermaidPrompt', () => {
  const projetoBase = { nome_projeto: 'Sistema X', descricao: 'Descrição', escopo: 'Escopo completo' };

  it('usa erDiagram para o tipo Modelagem', () => {
    const prompt = buildDocumentoMermaidPrompt({
      projeto: projetoBase,
      tipoDocumento: 'Modelagem',
      tituloDocumento: 'Modelo de Dados',
      descricaoExtra: '',
      requisitos: [],
    });

    expect(prompt.user).toContain('Use "erDiagram"');
    expect(prompt.user).toContain('"mermaid": "erDiagram\\n');
  });

  it('usa sequenceDiagram para o tipo API', () => {
    const prompt = buildDocumentoMermaidPrompt({
      projeto: projetoBase,
      tipoDocumento: 'API',
      tituloDocumento: 'Doc de API',
      descricaoExtra: '',
      requisitos: [],
    });

    expect(prompt.user).toContain('Use "sequenceDiagram"');
  });

  it('cai para flowchart em tipos sem diagrama específico mapeado', () => {
    const prompt = buildDocumentoMermaidPrompt({
      projeto: projetoBase,
      tipoDocumento: 'TipoInexistente',
      tituloDocumento: 'Doc Genérico',
      descricaoExtra: '',
      requisitos: [],
    });

    expect(prompt.user).toContain('Use "flowchart LR" ou "flowchart TD"');
  });

  it('inclui os requisitos cadastrados no prompt', () => {
    const prompt = buildDocumentoMermaidPrompt({
      projeto: projetoBase,
      tipoDocumento: 'Arquitetura',
      tituloDocumento: 'Doc de Arquitetura',
      descricaoExtra: '',
      requisitos: [{ tipo: 'Funcional', titulo: 'Login', descricao: 'Permitir login' }],
    });

    expect(prompt.user).toContain('Login');
    expect(prompt.user).toContain('Permitir login');
  });
});

describe('buildDocumentoPrompt', () => {
  const projetoBase = {
    nome_projeto: 'Sistema X',
    descricao: 'Descrição do projeto',
    modelo_projeto: 'Ágil',
    escopo: 'Escopo completo',
  };

  it('lista os requisitos já cadastrados no prompt', () => {
    const prompt = buildDocumentoPrompt({
      projeto: projetoBase,
      tipoDocumento: 'Requisitos',
      tituloDocumento: 'ERS do Sistema X',
      descricaoExtra: '',
      requisitos: [
        { tipo: 'Funcional', titulo: 'Login', descricao: 'Permitir login com email e senha' },
      ],
    });

    expect(prompt.user).toContain('Login');
    expect(prompt.user).toContain('Permitir login com email e senha');
    expect(prompt.user).toContain('ERS do Sistema X');
    expect(prompt.maxTokens).toBe(16000);
  });

  it('avisa quando não há requisitos cadastrados', () => {
    const prompt = buildDocumentoPrompt({
      projeto: projetoBase,
      tipoDocumento: 'Arquitetura',
      tituloDocumento: 'Doc de Arquitetura',
      descricaoExtra: '',
      requisitos: [],
    });

    expect(prompt.user).toContain('Nenhum requisito cadastrado no projeto ainda.');
  });

  it('usa instruções específicas de acordo com o tipo de documento', () => {
    const prompt = buildDocumentoPrompt({
      projeto: projetoBase,
      tipoDocumento: 'API',
      tituloDocumento: 'Doc de API',
      descricaoExtra: '',
      requisitos: [],
    });

    expect(prompt.user).toContain('Especificação de API REST');
  });

  it('cai para uma instrução genérica quando o tipo é desconhecido', () => {
    const prompt = buildDocumentoPrompt({
      projeto: projetoBase,
      tipoDocumento: 'TipoInexistente',
      tituloDocumento: 'Doc Genérico',
      descricaoExtra: '',
      requisitos: [],
    });

    expect(prompt.user).toContain('Documento técnico do tipo TipoInexistente');
  });
});

describe('formatRequisitoForApi', () => {
  it('aplica valores padrão quando campos opcionais estão ausentes', () => {
    const resultado = formatRequisitoForApi({ descricao: 'Descrição simples' });

    expect(resultado.tipo).toBe('Funcional');
    expect(resultado.prioridade).toBe('Média');
    expect(resultado.criterios_aceite).toEqual([]);
    expect(resultado.categoria).toBeNull();
  });

  it('inclui categoria, ator principal e critérios de aceite na descrição formatada', () => {
    const resultado = formatRequisitoForApi({
      codigo: 'RF-001',
      titulo: 'Login',
      descricao: 'Permitir login',
      tipo: 'Funcional',
      prioridade: 'Alta',
      categoria: 'Autenticação',
      ator_principal: 'Usuário',
      criterios_aceite: ['Deve validar email', 'Deve bloquear após 3 tentativas'],
    });

    expect(resultado.codigo).toBe('RF-001');
    expect(resultado.descricao).toContain('Categoria: Autenticação');
    expect(resultado.descricao).toContain('Ator principal: Usuário');
    expect(resultado.descricao).toContain('Deve validar email');
    expect(resultado.descricao).toContain('Deve bloquear após 3 tentativas');
  });
});

const documentoExemplo = {
  titulo: 'Documento X',
  sumario_executivo: 'Resumo do documento.',
  secoes: [
    {
      titulo: '1. Introdução',
      nivel: 1,
      conteudo: 'Texto da introdução.',
      itens: [],
      subsecoes: [
        {
          titulo: '1.1 Objetivo',
          nivel: 2,
          conteudo: 'Texto do objetivo.',
          itens: [],
          subsecoes: [],
        },
      ],
    },
    {
      titulo: '2. Escopo',
      nivel: 1,
      conteudo: 'Texto do escopo.',
      itens: ['Item A'],
      subsecoes: [],
    },
  ],
};

describe('buscarSecaoPorCaminho', () => {
  it('encontra uma seção raiz pelo caminho', () => {
    const secao = buscarSecaoPorCaminho(documentoExemplo.secoes, [1]);
    expect(secao.titulo).toBe('2. Escopo');
  });

  it('encontra uma subseção aninhada pelo caminho', () => {
    const secao = buscarSecaoPorCaminho(documentoExemplo.secoes, [0, 0]);
    expect(secao.titulo).toBe('1.1 Objetivo');
  });

  it('retorna null para um caminho fora dos limites', () => {
    expect(buscarSecaoPorCaminho(documentoExemplo.secoes, [5])).toBeNull();
    expect(buscarSecaoPorCaminho(documentoExemplo.secoes, [0, 9])).toBeNull();
  });
});

describe('buildRetrabalhoPrompt', () => {
  it('marca a seção alvo no resumo estrutural e inclui seu conteúdo completo', () => {
    const prompt = buildRetrabalhoPrompt({
      documento: documentoExemplo,
      caminhos: [[0, 0]],
      instrucao: 'Deixe mais detalhado.',
    });

    expect(prompt.user).toContain('1.1 Objetivo  <== SEÇÃO ALVO');
    expect(prompt.user).toContain('Texto do objetivo.');
    expect(prompt.user).toContain('Deixe mais detalhado.');
  });

  it('inclui todas as seções no resumo estrutural, mesmo as que não são alvo', () => {
    const prompt = buildRetrabalhoPrompt({
      documento: documentoExemplo,
      caminhos: [[1]],
      instrucao: '',
    });

    expect(prompt.user).toContain('1. Introdução');
    expect(prompt.user).toContain('1.1 Objetivo');
    expect(prompt.user).toContain('2. Escopo  <== SEÇÃO ALVO');
  });

  it('usa uma instrução padrão quando o usuário não escreve nada', () => {
    const prompt = buildRetrabalhoPrompt({ documento: documentoExemplo, caminhos: [[1]], instrucao: '' });
    expect(prompt.user).toContain('Melhore a clareza');
  });

  it('escala maxTokens com o número de seções alvo, até um teto', () => {
    const umaSecao = buildRetrabalhoPrompt({ documento: documentoExemplo, caminhos: [[0]], instrucao: '' });
    const duasSecoes = buildRetrabalhoPrompt({
      documento: documentoExemplo,
      caminhos: [[0], [1]],
      instrucao: '',
    });
    const muitasSecoes = buildRetrabalhoPrompt({
      documento: documentoExemplo,
      caminhos: Array.from({ length: 10 }, (_, i) => [i]),
      instrucao: '',
    });

    expect(duasSecoes.maxTokens).toBeGreaterThan(umaSecao.maxTokens);
    expect(muitasSecoes.maxTokens).toBe(16000);
  });
});
