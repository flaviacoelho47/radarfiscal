# Radar Fiscal Web Público

Versão íntegra para publicação no GitHub Pages, sem Python, PowerShell, localhost ou instalação no computador do visitante.

## Publicar

1. Crie um repositório no GitHub.
2. Envie todo o conteúdo desta pasta para a raiz do repositório.
3. Abra **Settings > Pages**.
4. Em **Build and deployment**, selecione **Deploy from a branch**.
5. Selecione a branch `main` e a pasta `/docs`.
6. Salve e aguarde a URL pública.
7. Abra **Actions > Atualizar notícias > Run workflow** para a primeira coleta.

## Atualização

- Automática: diariamente às 10:00 UTC, equivalente a 07:00 em UTC-3.
- Manual para o administrador: GitHub > Actions > Atualizar notícias > Run workflow.
- Botão do painel: recarrega os dados já publicados. Um site público não pode disparar um workflow administrativo sem expor credenciais.

## Fontes iniciais

Os dois feeds oficiais do Portal Contábeis estão ativos. Receita Federal, CONFAZ e Cenofisco devem ser adicionados quando houver RSS/API oficial ou integração autorizada.

## Segurança

Não coloque tokens no JavaScript público. O workflow utiliza apenas a permissão interna do próprio repositório para atualizar `docs/data/noticias.json`.
