const pool = require('../../db');

// Recalcula a mesma URL pública que o mermaid.ink usaria pra esse texto (sem
// chamada de rede - é só a mesma codificação de service/ai/mermaidRenderService.js).
// Vira o arquivo_url do documento: é um link real, que abre a imagem no
// navegador, e evita ter que tornar essa coluna nullable só porque
// documentos em formato diagrama não têm Google Doc (decisão de produto:
// esse formato não passa pelo Google Docs).
function urlMermaidInk(mermaidCode) {
  const encoded = Buffer.from(mermaidCode, 'utf8').toString('base64url');
  return `https://mermaid.ink/img/${encoded}?type=png`;
}

// Persiste um documento em formato "Diagrama Mermaid" - compartilhado entre
// o gerador de documentos (aiController.processarGeracaoDocumento, quando
// formato === 'mermaid') e o endpoint que o wizard usa pra salvar o diagrama
// de casos de uso já gerado/revisado ao finalizar a criação do projeto
// (documentosController.salvarDiagramaMermaid) - nenhum dos dois chama IA
// aqui, só grava o que já foi gerado.
async function salvarDocumentoMermaid({ projetoId, tipo, titulo, mermaid, imagemBase64, atores }) {
  const conteudoJson = {
    formato: 'mermaid',
    titulo,
    atores: atores || [],
    mermaid,
    imagem_base64: imagemBase64 || null,
  };

  const result = await pool.query(
    `INSERT INTO documentos (
      projeto_id, nome_do_arquivo, arquivo_url, tipo, descricao, data_criacao, conteudo_json
    )
    VALUES ($1, $2, $3, $4, $5, NOW(), $6)
    RETURNING *`,
    [
      projetoId,
      titulo,
      urlMermaidInk(mermaid),
      tipo,
      'Documento gerado automaticamente pela IA (diagrama Mermaid)',
      JSON.stringify(conteudoJson),
    ]
  );

  return result.rows[0];
}

module.exports = { salvarDocumentoMermaid, urlMermaidInk };
