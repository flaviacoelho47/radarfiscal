import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const DATA_FILE = 'docs/data/noticias.json';
const MAX_ITEMS = 15;

const sources = [
  { id:'contabeis', brand:'Contábeis', name:'Portal Contábeis', category:'Tributos Federais', description:'Discussões e atualizações sobre tributos federais.', logo:'https://www.google.com/s2/favicons?domain=contabeis.com.br&sz=128', portal:'https://www.contabeis.com.br/forum/3/tributos-federais/', rss:'https://www.contabeis.com.br/rss/forum/3/tributos-federais/' },
  { id:'receita', brand:'Receita Federal', name:'Receita Federal', category:'Notícias Oficiais', description:'Comunicados e atualizações oficiais.', logo:'https://www.google.com/s2/favicons?domain=gov.br&sz=128', portal:'https://www.gov.br/receitafederal/pt-br/assuntos/noticias', parser:parseReceita },
  { id:'iob-r', brand:'IOB', name:'IOB - Reforma Tributária', category:'Reforma Tributária', description:'Cobertura sobre IBS, CBS e transição tributária.', logo:'https://www.google.com/s2/favicons?domain=noticias.iob.com.br&sz=128', portal:'https://noticias.iob.com.br/editoria/reforma-tributaria/direto-de-brasilia/', parser:parseIob },
  { id:'iob-f', brand:'IOB', name:'IOB - Tributária/Fiscal', category:'Tributário e Fiscal', description:'Obrigações, legislação e rotina fiscal.', logo:'https://www.google.com/s2/favicons?domain=noticias.iob.com.br&sz=128', portal:'https://noticias.iob.com.br/editoria/tributaria-fiscal/', parser:parseIob },
  { id:'cgibs', brand:'CGIBS', name:'CGIBS', category:'IBS', description:'Notícias oficiais do Comitê Gestor do IBS.', logo:'https://www.google.com/s2/favicons?domain=cgibs.gov.br&sz=128', portal:'https://www.cgibs.gov.br/noticias', parser:parseCgibs },
  { id:'jota', brand:'JOTA', name:'JOTA - Tributos', category:'Tributos', description:'Análises e notícias sobre tributação, CARF e tribunais.', logo:'https://www.google.com/s2/favicons?domain=jota.info&sz=128', portal:'https://www.jota.info/tributos', parser:parseJota }
];

function decode(value='') {
  const named={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '};
  return value.replace(/\\u002F/gi,'/').replace(/\\u003A/gi,':').replace(/\\\//g,'/').replace(/&(#x?[0-9a-f]+|[a-z]+);/gi,(all,key)=>{
    if(key.startsWith('#')){const hex=key[1]?.toLowerCase()==='x';const code=parseInt(key.slice(hex?2:1),hex?16:10);return Number.isFinite(code)?String.fromCodePoint(code):all}
    return named[key.toLowerCase()] ?? ' ';
  });
}
function clean(value=''){return decode(value).replace(/<!\[CDATA\[|\]\]>/g,'').replace(/<script\b[\s\S]*?<\/script>/gi,' ').replace(/<style\b[\s\S]*?<\/style>/gi,' ').replace(/<svg\b[\s\S]*?<\/svg>/gi,' ').replace(/<[^>]+>/g,' ').replace(/[{}\[\]`]/g,' ').replace(/\s+/g,' ').trim()}
function absolute(url,base){try{return new URL(url,base).href}catch{return url}}
async function fetchText(url){const response=await fetch(url,{headers:{'user-agent':'Mozilla/5.0 (compatible; RadarFiscal/9.0)','accept':'text/html,application/xhtml+xml,application/rss+xml'},redirect:'follow',signal:AbortSignal.timeout(35000)});if(!response.ok)throw Error(`HTTP ${response.status}`);return response.text()}
function meta(html,key){const k=key.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');for(const rx of [new RegExp(`<meta[^>]+(?:property|name)=["']${k}["'][^>]+content=["']([^"']+)["']`,'i'),new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${k}["']`,'i')]){const m=html.match(rx);if(m)return clean(m[1])}return ''}
function tag(block,name){return clean((block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`,'i'))||[])[1])}
function classify(text=''){const b=text.toLowerCase(),map={'Reforma Tributária':['reforma tributária','reforma','plp'],'IBS/CBS':['ibs','cbs'],'ICMS':['icms','confaz'],'Simples Nacional':['simples nacional','mei'],'Tributos Federais':['tribut','carf','irpj','irrf','pis','cofins','dctf','reinf','stf','stj'],'NF-e/SPED':['nf-e','nfs-e','sped','df-e','dfe'],'Trabalhista':['trabalhista','tst','fgts','nr-1','esocial']};const r=Object.entries(map).filter(([,words])=>words.some(w=>b.includes(w))).map(([name])=>name);return r.length?r:['Tributos Federais']}
function item(source,title,url,summary='',publishedAt=''){return{id:crypto.createHash('sha256').update(`${source.id}|${url}`).digest('hex').slice(0,16),capturedAt:new Date().toISOString(),sourceId:source.id,sourceBrand:source.brand,sourceName:source.name,category:source.category,title:clean(title),summary:clean(summary).slice(0,320),url,publishedAt,themes:classify(`${title} ${summary}`)}}
async function enrich(record){try{const html=await fetchText(record.url);const summary=meta(html,'description')||meta(html,'og:description')||meta(html,'twitter:description');const publishedAt=record.publishedAt||meta(html,'article:published_time')||meta(html,'datePublished');return{...record,summary:(summary||record.summary).slice(0,320),publishedAt}}catch{return record}}
function parseLinks(html,source,pattern,datePattern){const seen=new Set(),out=[];for(const match of html.matchAll(pattern)){const url=absolute(match[1],source.portal),title=clean(match[2]);if(title.length<15||seen.has(url))continue;seen.add(url);const context=clean(html.slice(Math.max(0,match.index-180),Math.min(html.length,match.index+match[0].length+420)));const date=(context.match(datePattern)||[])[0]||'';out.push(item(source,title,url,context.replace(date,'').replace(title,''),date));if(out.length>=MAX_ITEMS)break}return out}
function parseReceita(html,source){return parseLinks(html,source,/<a[^>]+href=["']([^"']*\/receitafederal\/pt-br\/assuntos\/noticias\/\d{4}\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,/\b\d{2}\/\d{2}\/\d{4}/)}
function parseIob(html,source){return parseLinks(html,source,/<a[^>]+href=["']((?:https?:\/\/noticias\.iob\.com\.br)?\/(?!editoria)[^"'#?]+)["'][^>]*>([\s\S]*?)<\/a>/gi,/\b\d{2}\/\d{2}\/\d{4}/)}
function parseCgibs(html,source){return parseLinks(html,source,/<a[^>]+href=["']((?:https?:\/\/(?:www\.)?cgibs\.gov\.br)?\/(?!noticias(?:[?#]|$)|inicial(?:[/?#]|$))[^"'#?]+)["'][^>]*>([\s\S]*?)<\/a>/gi,/\b\d{2}\/\d{2}\/\d{4}\s*-\s*\d{1,2}h\d{2}(?:min)?/i)}
function parseJota(html,source){const normalized=decode(html),urls=new Set(),allowed='(?:tributos|trabalhista|justica|politica|economia|coberturas-especiais)';for(const rx of [new RegExp(`href=["']((?:https?:\\/\\/(?:www\\.)?jota\\.info)?\\/${allowed}\\/[^"'#?\\s]+)["']`,'gi'),new RegExp(`https?:\\/\\/(?:www\\.)?jota\\.info\\/${allowed}\\/[^"'<>?\\s]+`,'gi')])for(const m of normalized.matchAll(rx)){try{const u=new URL(m[1]||m[0],source.portal);u.hash='';u.search='';if(!/(\/page\/|\/tag\/|\/author\/|\/login|\/assine)/i.test(u.href))urls.add(u.href)}catch{}}return[...urls].slice(0,MAX_ITEMS).map(url=>item(source,url.split('/').pop().replaceAll('-',' '),url))}
async function parseRss(raw,source){const out=[];for(const block of raw.match(/<item\b[\s\S]*?<\/item>/gi)||[]){const title=tag(block,'title'),url=tag(block,'link');if(!title||!url)continue;out.push(item(source,title,url,tag(block,'description')||tag(block,'content:encoded'),tag(block,'pubDate')));if(out.length>=MAX_ITEMS)break}return out}

let previous={news:[],sources:[]};try{previous=JSON.parse(await fs.readFile(DATA_FILE,'utf8'))}catch{}
const allNews=[],allSources=[];
for(const source of sources){let records=[],error='';try{const raw=await fetchText(source.rss||source.portal);records=source.rss?await parseRss(raw,source):source.parser(raw,source);records=await Promise.all(records.map(enrich));records=records.filter(r=>r.title&&r.url);if(!records.length)error='Página respondeu, mas nenhum link de notícia foi reconhecido.'}catch(e){error=String(e.message||e).slice(0,180)}
  if(!records.length){records=(previous.news||[]).filter(r=>r.sourceId===source.id)}
  allNews.push(...records);allSources.push({id:source.id,brand:source.brand,name:source.name,category:source.category,description:source.description,logo:source.logo,portal:source.portal,count:records.length,lastUpdated:new Date().toISOString(),error});console.log(`${source.name}: ${records.length} itens${error?` | ${error}`:''}`)}
const unique=[...new Map(allNews.map(r=>[r.url,r])).values()];await fs.mkdir('docs/data',{recursive:true});await fs.writeFile(DATA_FILE,JSON.stringify({updatedAt:new Date().toISOString(),sources:allSources,news:unique},null,2));console.log(`TOTAL: ${unique.length} conteúdos gravados.`);
