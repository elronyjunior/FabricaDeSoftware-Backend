// Verifica a sintaxe de todos os arquivos .js do projeto com `node --check`
// (sem executar nada). Usado pelo workflow "Qualidade" e por `npm run check`.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const IGNORAR = new Set(['node_modules', '.git', 'coverage', 'docs']);

function listarJs(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((item) => {
    if (IGNORAR.has(item.name)) return [];
    const caminho = path.join(dir, item.name);
    if (item.isDirectory()) return listarJs(caminho);
    return item.name.endsWith('.js') ? [caminho] : [];
  });
}

const arquivos = listarJs(RAIZ);
const erros = [];
for (const arquivo of arquivos) {
  try {
    execFileSync(process.execPath, ['--check', arquivo], { stdio: 'pipe' });
  } catch (e) {
    erros.push(`${path.relative(RAIZ, arquivo)}\n${e.stderr.toString()}`);
  }
}

if (erros.length) {
  console.error(`Erro de sintaxe em ${erros.length} de ${arquivos.length} arquivo(s):\n`);
  console.error(erros.join('\n'));
  process.exit(1);
}
console.log(`Sintaxe OK em ${arquivos.length} arquivos .js.`);
