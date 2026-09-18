# Radar Fiscal V4 Profissional

## Publicação
Envie todo o conteúdo para a raiz do repositório, substituindo os arquivos atuais. Em seguida execute **Actions > Atualizar noticias > Run workflow**.

## Atualização horária
O workflow roda aos 17 minutos de cada hora (`17 * * * *`). O horário pode sofrer atraso conforme a fila do GitHub Actions.

## Portal Contábeis
A integração usa o RSS oficial do Fórum Tributos Federais:
`https://www.contabeis.com.br/rss/forum/3/tributos-federais/`

## Newsletter
O formulário está pronto visualmente, mas precisa de um provedor seguro para armazenar consentimento, confirmar cadastro e enviar e-mails. Configure a URL do endpoint em `docs/newsletter-config.js`.

Nunca coloque chave secreta no JavaScript público. Recomenda-se um serviço de newsletter com double opt-in e descadastro ou uma função serverless.

## JOTA
O card JOTA Tributos foi incluído. O coletor utiliza apenas títulos, trechos públicos e links. Conteúdo exclusivo/PRO continua sendo acessado somente no portal, conforme as permissões do assinante.

## Recarregar painel
O botão relê o JSON publicado sem cache. Ele não inicia um workflow, pois isso exigiria uma credencial administrativa exposta no site público.
