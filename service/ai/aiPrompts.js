const REQUISITOS_SYSTEM = `Você é um analista de requisitos sênior especializado em engenharia de software.
Sempre responda em português do Brasil.
Sua saída DEVE ser um JSON válido, sem markdown, sem comentários e sem texto fora do JSON.`;

function buildRequisitosPrompt({ nomeProjeto, escopo }) {
  return {
    system: REQUISITOS_SYSTEM,
    user: `Projeto: "${nomeProjeto}"
Escopo detalhado:
"""
${escopo}
"""

Gere no mínimo 15 requisitos (mínimo 60% funcionais e 40% não funcionais).
Cada requisito deve ser profundamente detalhado, como em um documento IEEE/BRD profissional.

Retorne EXCLUSIVAMENTE este JSON:
{
  "requisitos": [
    {
      "codigo": "RF-001 ou RNF-001",
      "titulo": "Título claro e específico",
      "descricao": "Descrição completa em 4 a 8 frases explicando o que o sistema deve fazer ou garantir, incluindo contexto de negócio e impacto.",
      "tipo": "Funcional ou Não Funcional",
      "prioridade": "Alta, Média ou Baixa",
      "categoria": "Ex: Autenticação, Performance, UX, Segurança, Integração",
      "ator_principal": "Quem executa ou se beneficia",
      "criterios_aceite": [
        "Critério mensurável 1",
        "Critério mensurável 2",
        "Critério mensurável 3"
      ],
      "pre_condicoes": "Condições necessárias antes da execução",
      "pos_condicoes": "Estado esperado após atendimento",
      "dependencias": ["Outros requisitos ou sistemas relacionados"],
      "riscos": "Riscos se o requisito não for atendido"
    }
  ]
}

Regras:
- Códigos únicos e sequenciais (RF para funcionais, RNF para não funcionais).
- Critérios de aceite sempre mensuráveis e testáveis.
- Evite requisitos genéricos ou vagos.`,
    temperature: 0.5,
  };
}

const CHAT_REQUISITOS_SYSTEM = `Você é um analista de requisitos sênior conversando em tempo real com a pessoa responsável pelo projeto para ajustar a lista de requisitos.
Sempre responda em português do Brasil.
Sua saída DEVE ser um JSON válido, sem markdown, sem comentários e sem texto fora do JSON.`;

// Turno único usado tanto pra primeira mensagem do chat quanto pras
// seguintes (diferente do diagrama, aqui não existe "gerar a partir de algo
// pronto" separado de "conversar" - todo turno já é uma mensagem de chat).
// Reenvia a lista ATUAL de requisitos a cada turno (não confia só na memória
// da sessão): a pessoa pode editar manualmente na tela (aprovar, editar,
// adicionar à mão) entre uma mensagem e outra, então a IA sempre parte do
// estado real da tela; o histórico da conversa serve de contexto de
// intenção, não de estado.
function buildTurnoChatRequisitos({ mensagem, nomeProjeto, escopo, requisitosAtuais }) {
  const listaAtual = (requisitosAtuais || []).length
    ? requisitosAtuais.map((r, i) => `${i + 1}. [${r.tipo || 'Funcional'}] ${r.titulo}: ${r.descricao}`).join('\n')
    : '(nenhum requisito cadastrado ainda)';

  return `Projeto: "${nomeProjeto}"
${escopo ? `Escopo: """${escopo}"""` : ''}

LISTA ATUAL DE REQUISITOS (pode ter sido editada manualmente pela pessoa desde a última mensagem - use este estado, não o que você lembra de antes):
${listaAtual}

MENSAGEM DA PESSOA: ${mensagem}

Aplique o que foi pedido (adicionar, editar, remover ou reorganizar requisitos - o que fizer sentido) e devolva a lista COMPLETA e atualizada (não só os alterados; requisitos não mencionados continuam exatamente como estão). Se o pedido for só uma pergunta, devolva a lista sem nenhuma mudança.

Retorne EXCLUSIVAMENTE este JSON:
{
  "resposta_chat": "Frase curta (1 a 2 frases) contando o que você fez, para aparecer como sua fala num chat - não repita a lista inteira aqui.",
  "requisitos": [
    {
      "codigo": "RF-001 ou RNF-001",
      "titulo": "Título claro e específico",
      "descricao": "Descrição completa, no mesmo padrão de detalhe de um documento de requisitos profissional.",
      "tipo": "Funcional ou Não Funcional",
      "prioridade": "Alta, Média ou Baixa"
    }
  ]
}`;
}

const CASO_DE_USO_SYSTEM = `Você é um analista de sistemas sênior especializado em UML e na ferramenta Mermaid.
Sempre responda em português do Brasil.
Sua saída DEVE ser um JSON válido, sem markdown, sem comentários e sem texto fora do JSON.`;

// Regras de sintaxe (e exemplo) do diagrama de casos de uso em Mermaid -
// extraídas em constantes porque são reaproveitadas tanto por
// buildCasoDeUsoPrompt (wizard) quanto por buildDocumentoMermaidPrompt
// (gerador de documentos, tipo "Casos de Uso"/"Arquitetura"/etc. em formato
// diagrama). Usa "flowchart" como sintaxe base em vez do tipo nativo
// "usecaseDiagram" do Mermaid: esse último é recente demais pra confiar no
// rendering agora (ver PR mermaid-js/mermaid#7530), enquanto o workaround
// com flowchart (atores em nós circulares, casos de uso em nós tipo
// "estádio" dentro de um subgraph) é sintaxe estável há anos.
const MERMAID_REGRAS_CASO_DE_USO = `- Use "flowchart LR" (não use "usecaseDiagram" - ainda não é suportado de forma confiável).
- Cada ator é um nó em forma de círculo, fora do sistema: Ator1(("Nome do Ator")).
- Os casos de uso ficam dentro de um subgraph representando o sistema: subgraph Sistema["Nome do sistema"] ... end.
- Cada caso de uso é um nó em forma de estádio: UC1(["Texto curto do caso de uso"]).
- Associação ator-caso de uso: uma aresta simples, ex: Ator1 --- UC1.
- Relação de inclusão/extensão entre casos de uso: aresta tracejada rotulada SEM aspas no rótulo, ex: UC1 -.->|include| UC2.
- IDs de nó curtos, em ASCII, sem espaços ou acentos (Ator1, Ator2, UC1, UC2...). O texto legível (com acentos, se precisar) fica só dentro dos rótulos entre colchetes/parênteses.
- NUNCA use aspas duplas (") em nenhum lugar do diagrama - nem em rótulos de nós, nem em rótulos de aresta. O diagrama inteiro vai dentro de uma string JSON, e aspas internas não escapadas quebram o JSON.
- NÃO inclua nada fora do bloco do diagrama (sem \`\`\`mermaid, sem explicações).`;

const MERMAID_EXEMPLO_CASO_DE_USO = `flowchart LR
  Cliente(("Cliente"))
  subgraph Sistema["Nome do Sistema"]
    UC1(["Realizar login"])
    UC2(["Consultar pedidos"])
  end
  Cliente --- UC1
  Cliente --- UC2
  UC2 -.->|include| UC1`;

// Gera só o diagrama (Mermaid) de casos de uso a partir dos requisitos já
// levantados no wizard - não depende de projeto salvo no banco (usado antes
// do projeto existir).
function buildCasoDeUsoPrompt({ nomeProjeto, escopo, requisitos }) {
  const funcionais = (requisitos || []).filter((r) => (r.tipo || 'Funcional') === 'Funcional');
  const naoFuncionais = (requisitos || []).filter((r) => (r.tipo || 'Funcional') !== 'Funcional');

  const funcionaisTexto = funcionais.length
    ? funcionais.map((r) => `- ${r.titulo}: ${r.descricao}`).join('\n')
    : 'Nenhum requisito funcional informado.';

  const naoFuncionaisTexto = naoFuncionais.length
    ? naoFuncionais.map((r) => `- ${r.titulo}: ${r.descricao}`).join('\n')
    : 'Nenhum requisito não funcional informado.';

  return {
    system: CASO_DE_USO_SYSTEM,
    user: `Projeto: "${nomeProjeto}"
${escopo ? `Escopo: """${escopo}"""` : ''}

REQUISITOS FUNCIONAIS (cada um vira, em geral, um caso de uso):
${funcionaisTexto}

REQUISITOS NÃO FUNCIONAIS (use só como contexto/restrição, NÃO vira bolha de caso de uso):
${naoFuncionaisTexto}

Gere um diagrama de casos de uso em Mermaid, identificando os atores envolvidos e um caso de uso para cada requisito funcional relevante (agrupe requisitos claramente duplicados em um único caso de uso).

REGRAS DE SINTAXE MERMAID (siga exatamente, sem exceções):
${MERMAID_REGRAS_CASO_DE_USO}

Exemplo do formato esperado (adapte nomes/quantidade ao projeto, não copie o conteúdo):
${MERMAID_EXEMPLO_CASO_DE_USO}

Retorne EXCLUSIVAMENTE este JSON:
{
  "resposta_chat": "Frase curta (1 frase) contando o que você gerou, para aparecer como sua fala num chat.",
  "titulo": "Diagrama de Casos de Uso - ${nomeProjeto}",
  "atores": ["Nome do Ator 1", "Nome do Ator 2"],
  "mermaid": "flowchart LR\\n  ...(diagrama completo em uma única string, com \\n separando as linhas)..."
}`,
    temperature: 0.4,
    maxTokens: 4000,
  };
}

// Turno de usuário curto pra pedir um ajuste sobre o diagrama já gerado
// nesta sessão de conversa - o contexto completo (regras de sintaxe, o
// diagrama atual) já está no histórico de mensagens, então não precisa
// repetir nada disso aqui; só o pedido novo. "resposta_chat" é o que aparece
// como bolha da IA no painel de chat (Chat_IA_Panel.dart no frontend) -
// precisa ser breve, não uma explicação longa.
function buildTurnoRefinamentoDiagrama(instrucao) {
  return `Aplique este ajuste ao diagrama que você acabou de gerar, mantendo exatamente as mesmas regras de sintaxe já combinadas, e devolva o diagrama COMPLETO atualizado (não apenas a parte alterada), no mesmo formato JSON de antes (incluindo "resposta_chat" - uma frase curta contando o que você mudou, ex: "Removi o ator Cliente e ajustei os casos de uso ligados a ele.").

Ajuste pedido: ${(instrucao || '').trim() || 'Revise e melhore o diagrama atual.'}`;
}

const DOCUMENTO_SYSTEM = `Você é um arquiteto de software e analista de negócios sênior.
Produza documentação técnica profissional em português do Brasil.
Sempre responda com JSON válido, sem markdown externo, sem comentários.`;

const DOCUMENTO_SCHEMA = `{
  "titulo": "Título completo do documento",
  "tipo_documento": "Tipo informado",
  "versao": "1.0",
  "metadata": {
    "projeto": "Nome do projeto",
    "autor": "IA - Fábrica de Software",
    "objetivo": "Objetivo principal"
  },
  "sumario_executivo": "Resumo direto em 2 a 3 frases",
  "secoes": [
    {
      "titulo": "1. Nome da seção",
      "nivel": 1,
      "conteudo": "Explicação direta (máximo 2 parágrafos curtos)",
      "itens": ["[RF-001] Requisito ou Tópico: Descrição concisa"],
      "subsecoes": [
        {
          "titulo": "1.1 Subseção",
          "nivel": 2,
          "conteudo": "Texto objetivo ou introdução aos itens",
          "itens": ["Ponto chave 1", "Ponto chave 2"]
        }
      ]
    }
  ],
  "tabelas": [
    {
      "titulo": "Título da tabela",
      "cabecalhos": ["Coluna 1", "Coluna 2"],
      "linhas": [["valor", "valor"]]
    }
  ],
  "conclusao": "Uma ou duas frases de conclusão"
}`;

const TIPO_INSTRUCOES = {
  Requisitos: `Documento de Especificação de Requisitos (ERS).
Siga a lógica do modelo "Requisitos do Projeto": seções numeradas, subseções por categoria e requisitos como itens de lista.
Estrutura recomendada: 1. Introdução (1.1 Objetivo, 1.2 Público-Alvo), 2. Requisitos Funcionais (RF), 3. Segurança, 4. Requisitos Não Funcionais (RNF), regras de negócio, restrições e matriz de rastreabilidade.
Para requisitos em "itens", use sempre o padrão "[RF-001] Nome: descrição" ou "[RNF-001] Nome: descrição"; não inclua marcador manual.
Inclua: visão do produto, stakeholders, glossário, requisitos funcionais detalhados, requisitos não funcionais (performance, segurança, usabilidade, disponibilidade), regras de negócio, restrições e matriz de rastreabilidade.
Mínimo 8 seções principais e 3 tabelas.`,
  'Casos de Uso': `Documento de Casos de Uso UML.
Inclua: atores, diagrama descritivo, casos de uso detalhados (nome, ID, ator, descrição, pré/pós-condições, fluxo principal, fluxos alternativos, exceções).
Mínimo 6 casos de uso completos em subseções.`,
  Arquitetura: `Documento de Arquitetura de Software.
Inclua: contexto, visão lógica, visão física, tecnologias, camadas, integrações, decisões arquiteturais (ADRs), requisitos não funcionais atendidos e riscos técnicos.`,
  API: `Documento de Especificação de API REST.
Inclua: visão geral, autenticação, convenções, endpoints detalhados (método, path, parâmetros, body, respostas, erros), modelos de dados e exemplos.`,
  Modelagem: `Documento de Modelagem de Dados.
Inclua: entidades, atributos, relacionamentos, cardinalidade, dicionário de dados e regras de integridade.`,
  Testes: `Plano de Testes.
Inclua: escopo, estratégia, tipos de teste, ambientes, casos de teste detalhados, critérios de entrada/saída e matriz de rastreabilidade.`,
  Código: `Documento de Padrões e Estrutura de Código.
Inclua: stack, organização de pastas, convenções de nomenclatura, padrões de projeto, fluxo de desenvolvimento e boas práticas.`,
};

function buildDocumentoPrompt({ projeto, tipoDocumento, tituloDocumento, descricaoExtra, requisitos }) {
  const instrucaoTipo = TIPO_INSTRUCOES[tipoDocumento] || `Documento técnico do tipo ${tipoDocumento} com alto nível de detalhe profissional.`;

  const requisitosTexto = requisitos.length
    ? requisitos.map((r) => `- [${r.tipo}] ${r.titulo}: ${r.descricao}`).join('\n')
    : 'Nenhum requisito cadastrado no projeto ainda.';

  return {
    system: DOCUMENTO_SYSTEM,
    user: `Gere um documento técnico completo e detalhado.

TIPO: ${tipoDocumento}
TÍTULO SOLICITADO: ${tituloDocumento}

PROJETO:
- Nome: ${projeto.nome_projeto}
- Descrição: ${projeto.descricao || 'Sem descrição'}
- Modelo: ${projeto.modelo_projeto || 'Padrão'}
- Escopo: ${projeto.escopo || 'Não informado'}

REQUISITOS JÁ CADASTRADOS NO PROJETO:
${requisitosTexto}

INSTRUÇÕES ESPECÍFICAS DO TIPO:
${instrucaoTipo}

INSTRUÇÕES EXTRAS DO USUÁRIO:
${descricaoExtra || 'Siga as melhores práticas de engenharia de software.'}

Retorne EXCLUSIVAMENTE um JSON neste formato:
${DOCUMENTO_SCHEMA}

Regras CRÍTICAS para velocidade e qualidade:
1. SEJA EXTREMAMENTE OBJETIVO. Use tópicos curtos (array de "itens") em vez de parágrafos densos.
2. Foque em dados técnicos puros. Remova introduções genéricas (ex: "Este documento visa...").
3. Limite descrições a 2 ou 3 frases no máximo. A qualidade técnica está na precisão, não na quantidade de palavras.
4. Numere os títulos de seções no próprio campo "titulo" (ex: "2.1 Segurança").
5. O documento final será gerado no Google Docs; seu JSON será o motor de dados. Não use markdown.
6. FIDELIDADE AOS REQUISITOS: Quando listar requisitos no documento, use EXATAMENTE e APENAS os fornecidos em "REQUISITOS JÁ CADASTRADOS NO PROJETO". Não omita nenhum requisito da lista e NUNCA invente novos.\``,
    temperature: 0.45,
    maxTokens: 16000,
  };
}

// Regras de sintaxe Mermaid por tipo de diagrama, usadas pelo formato
// "Diagrama Mermaid" do gerador de documentos (buildDocumentoMermaidPrompt).
// erDiagram e sequenceDiagram são tipos nativos e estáveis do Mermaid (bem
// mais antigos e maduros que o usecaseDiagram) - por isso, ao contrário do
// caso de uso, aqui não precisamos de nenhum workaround.
const MERMAID_RULES_POR_TIPO_DIAGRAMA = {
  flowchart: {
    primeiraLinha: 'flowchart LR',
    regras: `- Use "flowchart LR" ou "flowchart TD".
- Cada elemento é um nó com um rótulo curto e claro: N1["Texto"].
- Agrupe elementos relacionados em subgraphs quando fizer sentido: subgraph Nome["Título"] ... end.
- Setas simples pra fluxo/dependência principal: N1 --> N2. Setas tracejadas pra relações secundárias: N1 -.-> N2.
- IDs de nó curtos, em ASCII, sem espaços ou acentos. Texto legível (com acentos, se precisar) só dentro dos rótulos.
- NÃO use aspas duplas dentro do texto dos rótulos.`,
    exemplo: `flowchart LR
  A["Módulo A"] --> B["Módulo B"]
  B --> C["Módulo C"]
  A -.-> C`,
  },
  erDiagram: {
    primeiraLinha: 'erDiagram',
    regras: `- Use "erDiagram".
- Nomes de entidade em maiúsculas, sem espaços nem acentos (ex: PEDIDO, CLIENTE).
- Relacionamentos com notação pé-de-galinha e um rótulo verbal curto: ENTIDADE_A ||--o{ ENTIDADE_B : "verbo".
- Liste só os atributos mais relevantes de cada entidade (tipo + nome), sem exagerar no detalhe.`,
    exemplo: `erDiagram
  CLIENTE ||--o{ PEDIDO : realiza
  PEDIDO ||--|{ ITEM_PEDIDO : contem
  CLIENTE {
    string nome
    string email
  }`,
  },
  sequenceDiagram: {
    primeiraLinha: 'sequenceDiagram',
    regras: `- Use "sequenceDiagram".
- Declare os participantes no início: participant Nome.
- Use "->>" pra chamada/requisição e "-->>" pra resposta, sempre com um rótulo curto depois de ":".
- Mantenha a sequência na ordem cronológica real do fluxo descrito.`,
    exemplo: `sequenceDiagram
  participant Cliente
  participant API
  Cliente->>API: POST /login
  API-->>Cliente: 200 OK + token`,
  },
};

// Qual tipo de diagrama Mermaid faz mais sentido pra cada tipo de documento.
// A qualidade tende a variar por tipo (nem todo documento se presta bem a um
// diagrama), mas a mecânica é a mesma pra todos.
const TIPO_DIAGRAMA_MERMAID = {
  'Casos de Uso': 'flowchart',
  Arquitetura: 'flowchart',
  Requisitos: 'flowchart',
  Testes: 'flowchart',
  Código: 'flowchart',
  Modelagem: 'erDiagram',
  API: 'sequenceDiagram',
};

const DOCUMENTO_MERMAID_SYSTEM = `Você é um arquiteto de software sênior especializado em comunicar sistemas através de diagramas Mermaid.
Sempre responda em português do Brasil.
Sua saída DEVE ser um JSON válido, sem markdown, sem comentários e sem texto fora do JSON.`;

// Versão em "Diagrama Mermaid" do gerador de documentos do projeto (formato
// alternativo ao texto/Google Docs de buildDocumentoPrompt). Reaproveita a
// mesma instrução semântica por tipo (TIPO_INSTRUCOES) já usada no formato
// texto, só troca "como escrever" (seções/tabelas) por "como desenhar"
// (regras Mermaid do tipo de diagrama escolhido em TIPO_DIAGRAMA_MERMAID).
function buildDocumentoMermaidPrompt({ projeto, tipoDocumento, tituloDocumento, descricaoExtra, requisitos }) {
  const instrucaoTipo = TIPO_INSTRUCOES[tipoDocumento] || `Documento técnico do tipo ${tipoDocumento}.`;
  const diagramaTipo = TIPO_DIAGRAMA_MERMAID[tipoDocumento] || 'flowchart';
  const { primeiraLinha, regras, exemplo } = MERMAID_RULES_POR_TIPO_DIAGRAMA[diagramaTipo];

  const requisitosTexto = (requisitos || []).length
    ? requisitos.map((r) => `- [${r.tipo}] ${r.titulo}: ${r.descricao}`).join('\n')
    : 'Nenhum requisito cadastrado no projeto ainda.';

  return {
    system: DOCUMENTO_MERMAID_SYSTEM,
    user: `Gere um diagrama Mermaid que represente este documento técnico.

TIPO DE DOCUMENTO: ${tipoDocumento}
TÍTULO SOLICITADO: ${tituloDocumento}

PROJETO:
- Nome: ${projeto.nome_projeto}
- Descrição: ${projeto.descricao || 'Sem descrição'}
- Escopo: ${projeto.escopo || 'Não informado'}

O QUE ESSE TIPO DE DOCUMENTO DEVE REPRESENTAR:
${instrucaoTipo}

REQUISITOS JÁ CADASTRADOS NO PROJETO:
${requisitosTexto}

INSTRUÇÕES EXTRAS DO USUÁRIO:
${descricaoExtra || 'Siga as melhores práticas de engenharia de software.'}

REGRAS DE SINTAXE MERMAID (siga exatamente, sem exceções):
${regras}

Exemplo do formato esperado (adapte ao conteúdo real do projeto, não copie):
${exemplo}

Retorne EXCLUSIVAMENTE este JSON:
{
  "titulo": "${tituloDocumento}",
  "atores": ["elemento/entidade/participante 1", "..."],
  "mermaid": "${primeiraLinha}\\n  ...(diagrama completo em uma única string, com \\n separando as linhas)..."
}`,
    temperature: 0.4,
    maxTokens: 4000,
  };
}

function formatRequisitoForApi(requisito) {
  const partes = [requisito.descricao || ''];

  if (requisito.categoria) partes.push(`\nCategoria: ${requisito.categoria}`);
  if (requisito.ator_principal) partes.push(`Ator principal: ${requisito.ator_principal}`);
  if (requisito.pre_condicoes) partes.push(`Pré-condições: ${requisito.pre_condicoes}`);
  if (requisito.pos_condicoes) partes.push(`Pós-condições: ${requisito.pos_condicoes}`);

  if (Array.isArray(requisito.criterios_aceite) && requisito.criterios_aceite.length) {
    partes.push('\nCritérios de aceite:');
    requisito.criterios_aceite.forEach((c) => partes.push(`• ${c}`));
  }

  if (Array.isArray(requisito.dependencias) && requisito.dependencias.length) {
    partes.push(`\nDependências: ${requisito.dependencias.join(', ')}`);
  }

  if (requisito.riscos) partes.push(`\nRiscos: ${requisito.riscos}`);

  return {
    codigo: requisito.codigo || null,
    titulo: requisito.titulo || 'Requisito',
    descricao: partes.join('\n').trim(),
    tipo: requisito.tipo || 'Funcional',
    prioridade: requisito.prioridade || 'Média',
    criterios_aceite: requisito.criterios_aceite || [],
    categoria: requisito.categoria || null,
  };
}

function buscarSecaoPorCaminho(secoes, caminho) {
  let nivelAtual = Array.isArray(secoes) ? secoes : [];
  let secao = null;

  for (const indice of caminho) {
    secao = nivelAtual[indice];
    if (!secao) return null;
    nivelAtual = Array.isArray(secao.subsecoes) ? secao.subsecoes : [];
  }

  return secao;
}

function caminhoIgual(a, b) {
  return a.length === b.length && a.every((valor, indice) => valor === b[indice]);
}

// Resumo estrutural do documento inteiro (só títulos/nível, sem o texto
// completo de cada seção) — é isso que permite dar contexto pra IA sem o
// custo/tempo crescer com o tamanho do documento todo: só as seções alvo
// entram com o conteúdo completo no prompt.
function montarResumoEstrutural(secoes, caminhosAlvo, caminhoAtual = []) {
  if (!Array.isArray(secoes)) return '';

  return secoes
    .map((secao, indice) => {
      const caminho = [...caminhoAtual, indice];
      const eAlvo = caminhosAlvo.some((alvo) => caminhoIgual(alvo, caminho));
      const indentacao = '  '.repeat(caminho.length - 1);
      const marcador = eAlvo ? '  <== SEÇÃO ALVO (será reescrita)' : '';
      const linha = `${indentacao}- [nível ${secao.nivel}] ${secao.titulo || '(sem título)'}${marcador}`;
      const subLinhas = montarResumoEstrutural(secao.subsecoes, caminhosAlvo, caminho);
      return [linha, subLinhas].filter(Boolean).join('\n');
    })
    .join('\n');
}

const RETRABALHO_SYSTEM = `Você é um analista/arquiteto de software sênior revisando um documento técnico já existente.
Você reescreve APENAS a(s) seção(ões) marcada(s) como alvo, usando o restante do documento apenas como contexto para manter consistência e evitar repetição.
Não invente novas seções fora das indicadas, a menos que a instrução do usuário peça explicitamente para dividir a seção alvo em subseções.
Sempre responda em português do Brasil.
Sua saída DEVE ser um JSON válido, sem markdown, sem comentários e sem texto fora do JSON.`;

function buildRetrabalhoPrompt({ documento, caminhos, instrucao }) {
  const resumoEstrutural = montarResumoEstrutural(documento.secoes, caminhos);

  const secoesAlvoTexto = caminhos
    .map((caminho) => {
      const secaoAtual = buscarSecaoPorCaminho(documento.secoes, caminho);
      return `Caminho ${JSON.stringify(caminho)}:\n${JSON.stringify(secaoAtual)}`;
    })
    .join('\n\n');

  return {
    system: RETRABALHO_SYSTEM,
    user: `DOCUMENTO: "${documento.titulo || 'Sem título'}"
${documento.sumario_executivo ? `Resumo: ${documento.sumario_executivo}` : ''}

ESTRUTURA COMPLETA DO DOCUMENTO (contexto — não reescreva o que não estiver marcado como alvo):
${resumoEstrutural}

SEÇÃO(ÕES) ALVO A REESCREVER (conteúdo atual):
${secoesAlvoTexto}

INSTRUÇÃO DO USUÁRIO:
${(instrucao || '').trim() || 'Melhore a clareza, profundidade e qualidade técnica desta(s) seção(ões), mantendo o mesmo assunto.'}

Retorne EXCLUSIVAMENTE este JSON, com uma entrada por seção alvo, na mesma ordem em que foram apresentadas acima:
{
  "secoes": [
    {
      "caminho": [0],
      "secao": {
        "titulo": "...",
        "nivel": 1,
        "conteudo": "...",
        "itens": ["..."],
        "subsecoes": []
      }
    }
  ]
}

Regras:
- "caminho" deve ser copiado exatamente como foi apresentado para cada seção alvo, sem alterar.
- "secao" segue exatamente esse formato (titulo, nivel, conteudo, itens, subsecoes), mesmo que subsecoes fique vazio.
- Não inclua nenhuma seção que não esteja na lista de alvos.`,
    temperature: 0.5,
    maxTokens: Math.min(16000, 3000 * caminhos.length + 2000),
  };
}

module.exports = {
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
};
