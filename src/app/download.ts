/** Baixa um arquivo gerado no aparelho (no iPhone, o Safari oferece salvar em Arquivos). */
export function download(name: string, content: string | Blob, type = 'application/json') {
  const blob = typeof content === 'string' ? new Blob([content], { type }) : content;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
