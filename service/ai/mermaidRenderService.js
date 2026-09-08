// Converte código Mermaid em imagem chamando o serviço público mermaid.ink -
// evita adicionar Puppeteer/Chromium à imagem Docker (node:18-alpine) só
// pra renderizar um diagrama. Node 18 já tem `fetch` global e suporte a
// 'base64url' no Buffer, então não precisa de nenhuma dependência nova.
//
// Usa o endpoint /img (PNG), não /svg: o SVG do mermaid.ink estiliza os nós
// via <style> com seletores de classe (ex: "#mermaid-svg .node rect{fill:...}")
// e os elementos em si não trazem cor nenhuma (<rect style="" .../>) - o
// flutter_svg não resolve esse CSS por classe/id e cai no preenchimento
// padrão do SVG (preto), o que fazia o diagrama aparecer todo preto e
// "quebrado" no app. PNG já vem rasterizado com as cores certas, sem
// depender de nenhum parser de CSS no cliente.
async function renderMermaidToPng(mermaidCode) {
  if (!mermaidCode || typeof mermaidCode !== 'string' || !mermaidCode.trim()) {
    throw new Error('Código Mermaid vazio - nada para renderizar.');
  }

  const encoded = Buffer.from(mermaidCode, 'utf8').toString('base64url');
  const url = `https://mermaid.ink/img/${encoded}?type=png`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`mermaid.ink respondeu ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer).toString('base64');
}

module.exports = { renderMermaidToPng };
