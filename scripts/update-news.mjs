import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const DATA_FILE = 'docs/data/noticias.json';
const MAX_PER_SOURCE = 15;

const sources = [
  {
    id: 'cgibs',
    brand: 'CGIBS',
    name: 'CGIBS',
    category: 'IBS',
    description: 'Noticias oficiais do Comite Gestor do IBS.',
    logo: 'https://www.google.com/s2/favicons?domain=cgibs.gov.br&sz=128',
    portal: 'https://www.cgibs.gov.br/noticias',
    parser: parseCgibs
  },
  {
    id: 'jota',
    brand: 'JOTA',
    name: 'JOTA - Tributos',
    category: 'Tributos',
    description: 'Analises e noticias sobre tributacao, CARF e tribunais.',
    logo: 'https://www.google.com/s2/favicons?domain=jota.info&sz=128',
    portal: 'https://www.jota.info/tributos',
    parser: parseJota
  }
];

function decodeEntities(value = '') {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (all, key) => {
    if (key.startsWith('#')) {
      const isHex = key[1]?.toLowerCase() === 'x';
      const code = Number.parseInt(key.slice(isHex ? 2 : 1), isHex ? 16 : 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : all;
    }
    return named[key.toLowerCase()] ?? ' ';
  });
}

function clean(value = '') {
  return decodeEntities(value)
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\\u[0-9a-f]{4}|\\[nrt]/gi, ' ')
    .replace(/[{}\[\]`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function absolute(url, base) {
  try { return new URL(url, base).href; } catch { return url; }
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 (compatible; RadarFiscal/8.2; +https://github.com/)',
      accept: 'text/html,application/xhtml+xml'
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(35000)
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

function metaContent(html, property) {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, 'i')
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return clean(match[1]);
  }
  return '';
}

async function enrichPreview(item) {
  try {
    const html = await fetchText(item.url);
    const summary =
      metaContent(html, 'description') ||
      metaContent(html, 'og:description') ||
      metaContent(html, 'twitter:description');
    return { ...item, summary: summary.slice(0, 320) || item.summary };
  } catch {
    return item;
  }
}

function classify(text = '') {
  const value = text.toLowerCase();
  const map = {
    'Reforma Tributaria': ['reforma tributaria', 'reforma', 'plp'],
    'IBS/CBS': ['ibs', 'cbs'],
    ICMS: ['icms', 'confaz'],
    'Simples Nacional': ['simples nacional', 'mei'],
    'Tributos Federais': ['irpj', 'irrf', 'pis', 'cofins', 'dctf', 'reinf', 'carf'],
    'NF-e/SPED': ['nf-e', 'nfs-e', 'sped', 'df-e', 'dfe'],
    Trabalhista: ['trabalhista', 'fgts', 'esocial', 'e-social', 'tst', 'nr-1']
  };
  const result = Object.entries(map)
    .filter(([, terms]) => terms.some(term => value.includes(term)))
    .map(([theme]) => theme);
  return result.length ? result : ['Tributos Federais'];
}

function createItem(source, title, url, summary = '', publishedAt = '') {
  return {
    id: crypto.createHash('sha256').update(`${source.id}|${url}`).digest('hex').slice(0, 16),
    capturedAt: new Date().toISOString(),
    sourceId: source.id,
    sourceBrand: source.brand,
    sourceName: source.name,
    category: source.category,
    title: clean(title),
    summary: clean(summary).slice(0, 320),
    url,
    publishedAt,
    themes: classify(`${title} ${summary}`)
  };
}

function parseCgibs(html, source) {
  const items = [];
  const seen = new Set();
  const linkPattern = /<a[^>]+href=["']((?:https?:\/\/(?:www\.)?cgibs\.gov\.br)?\/(?!noticias(?:[?#]|$)|inicial(?:[/?#]|$))[^"'#?]+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(linkPattern)) {
    const url = absolute(match[1], source.portal);
    const title = clean(match[2]);
    if (title.length < 18 || seen.has(url)) continue;
    if (/^(voltar|imprimir|inicial|proxima|anterior)$/i.test(title)) continue;
    seen.add(url);

    const context = clean(html.slice(Math.max(0, match.index - 230), Math.min(html.length, match.index + match[0].length + 520)));
    const date = (context.match(/\b\d{2}\/\d{2}\/\d{4}\s*-\s*\d{1,2}h\d{2}(?:min)?/i) || [])[0] || '';
    const summary = context.replace(date, '').replace(title, '').slice(0, 320);
    items.push(createItem(source, title, url, summary, date));
    if (items.length >= MAX_PER_SOURCE) break;
  }
  return items;
}

function parseJota(html, source) {
  const items = [];
  const seen = new Set();
  const linkPattern = /<a[^>]+href=["']((?:https?:\/\/(?:www\.)?jota\.info)?\/(?:tributos|trabalhista|justica|politica|economia|coberturas-especiais)\/[^"'#?]+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(linkPattern)) {
    const url = absolute(match[1], source.portal);
    const title = clean(match[2]);
    if (title.length < 18 || seen.has(url)) continue;
    if (/^(inicio|conheca|login|assine|proxima|anterior|tributos|jota pro)$/i.test(title)) continue;
    seen.add(url);

    const context = clean(html.slice(Math.max(0, match.index - 180), Math.min(html.length, match.index + match[0].length + 380)));
    const date = (context.match(/\b\d{1,2}\/\d{1,2}\/\d{4}\s*\|\s*\d{1,2}:\d{2}/) ||
                  context.match(/\b\d{1,2}\/\d{1,2}\/\d{4}/) || [])[0] || '';
    const summary = context.replace(date, '').replace(title, '').slice(0, 320);
    items.push(createItem(source, title, url, summary, date));
    if (items.length >= MAX_PER_SOURCE) break;
  }
  return items;
}

let previous = { news: [], sources: [] };
try { previous = JSON.parse(await fs.readFile(DATA_FILE, 'utf8')); } catch {}

const retainedNews = (previous.news || []).filter(item => !['cgibs', 'jota'].includes(item.sourceId));
const retainedSources = (previous.sources || []).filter(source => !['cgibs', 'jota'].includes(source.id));
const capturedNews = [];
const updatedSources = [];

for (const source of sources) {
  let items = [];
  let error = '';
  try {
    const html = await fetchText(source.portal);
    items = source.parser(html, source);
    items = await Promise.all(items.map(enrichPreview));
    items = items.filter(item => item.title && item.url);
    if (!items.length) error = 'Pagina respondeu, mas nenhum link de noticia foi reconhecido.';
  } catch (exception) {
    error = String(exception.message || exception).slice(0, 180);
  }
  capturedNews.push(...items);
  updatedSources.push({
    id: source.id,
    brand: source.brand,
    name: source.name,
    category: source.category,
    description: source.description,
    logo: source.logo,
    portal: source.portal,
    count: items.length,
    lastUpdated: new Date().toISOString(),
    error
  });
  console.log(`${source.name}: ${items.length} itens${error ? ` | ${error}` : ''}`);
}

const news = [...new Map([...retainedNews, ...capturedNews].map(item => [item.url, item])).values()];
const allSources = [...retainedSources, ...updatedSources];
await fs.mkdir('docs/data', { recursive: true });
await fs.writeFile(DATA_FILE, JSON.stringify({ updatedAt: new Date().toISOString(), sources: allSources, news }, null, 2));
console.log(`Arquivo atualizado com ${news.length} conteudos no total.`);
