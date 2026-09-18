import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const sources = [
  {id:'contabeis',brand:'Contábeis',name:'Portal Contábeis',category:'Tributos Federais',description:'Discussões e atualizações sobre tributos federais.',logo:'https://www.google.com/s2/favicons?domain=contabeis.com.br&sz=128',portal:'https://www.contabeis.com.br/forum/3/tributos-federais/',rss:'https://www.contabeis.com.br/rss/forum/3/tributos-federais/'},
  {id:'receita',brand:'Receita Federal',name:'Receita Federal',category:'Notícias Oficiais',description:'Comunicados e atualizações oficiais.',logo:'https://www.google.com/s2/favicons?domain=gov.br&sz=128',portal:'https://www.gov.br/receitafederal/pt-br/assuntos/noticias',pattern:/href=["']([^"']*\/receitafederal\/pt-br\/assuntos\/noticias\/\d{4}\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi},
  {id:'iob-r',brand:'IOB',name:'IOB - Reforma Tributária',category:'Reforma Tributária',description:'Cobertura sobre IBS, CBS e transição tributária.',logo:'https://www.google.com/s2/favicons?domain=noticias.iob.com.br&sz=128',portal:'https://noticias.iob.com.br/editoria/reforma-tributaria/direto-de-brasilia/',pattern:/href=["'](https:\/\/noticias\.iob\.com\.br\/(?!editoria)[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi},
  {id:'iob-f',brand:'IOB',name:'IOB - Tributária/Fiscal',category:'Tributário e Fiscal',description:'Obrigações, legislação e rotina fiscal.',logo:'https://www.google.com/s2/favicons?domain=noticias.iob.com.br&sz=128',portal:'https://noticias.iob.com.br/editoria/tributaria-fiscal/',pattern:/href=["'](https:\/\/noticias\.iob\.com\.br\/(?!editoria)[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi},
  {id:'cgibs',brand:'CGIBS',name:'CGIBS',category:'IBS',description:'Notícias oficiais do Comitê Gestor do IBS.',logo:'https://www.google.com/s2/favicons?domain=cgibs.gov.br&sz=128',portal:'https://www.cgibs.gov.br/noticias',pattern:/href=["'](https?:\/\/(?:www\.)?cgibs\.gov\.br\/(?!noticias|inicial)[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi},
  {id:'jota',brand:'JOTA',name:'JOTA - Tributos',category:'Tributos',description:'Análises sobre tributação, CARF e tribunais.',logo:'https://www.google.com/s2/favicons?domain=jota.info&sz=128',portal:'https://www.jota.info/tributos',pattern:/href=["'](https:\/\/(?:www\.)?jota\.info\/tributos\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi}
];

function decodeEntities(value='') {
  const named={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '};
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi,(all,key)=>{
    if(key[0]==='#'){
      const hex=key[1]?.toLowerCase()==='x';
      const code=parseInt(key.slice(hex?2:1),hex?16:10);
      return Number.isFinite(code)?String.fromCodePoint(code):all;
    }
    return named[key.toLowerCase()] ?? ' ';
  });
}

function clean(value='') {
  return decodeEntities(value)
    .replace(/<!\[CDATA\[|\]\]>/g,'')
    .replace(/<script\b[\s\S]*?<\/script>/gi,' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi,' ')
    .replace(/<svg\b[\s\S]*?<\/svg>/gi,' ')
    .replace(/<[^>]+>/g,' ')
    .replace(/\\u[0-9a-f]{4}|\\[nrt]/gi,' ')
    .replace(/[{}\[\]`]|(?:class|style|data-[\w-]+|aria-[\w-]+)\s*=\s*["'][^"']*["']/gi,' ')
    .replace(/\s+/g,' ')
    .trim();
}

const tag=(block,name)=>clean((block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`,'i'))||[])[1]);
const absolute=(url,base)=>{try{return new URL(url,base).href}catch{return url}};
const fetchText=async url=>{const response=await fetch(url,{headers:{'user-agent':'Mozilla/5.0 (compatible; RadarFiscal/8.0)'},redirect:'follow',signal:AbortSignal.timeout(35000)});if(!response.ok)throw new Error(`HTTP ${response.status}`);return response.text()};

function classify(text='') {
  const value=text.toLowerCase();
  const map={'Reforma Tributária':['reforma tributária','reforma','plp'],'IBS/CBS':['ibs','cbs'],'ICMS':['icms','confaz'],'Simples Nacional':['simples nacional','mei'],'Tributos Federais':['irpj','irrf','pis','cofins','dctf','reinf','carf'],'NF-e/SPED':['nf-e','nfs-e','sped','df-e','dfe'],'Trabalhista':['trabalhista','fgts','esocial','e-social']};
  const result=Object.entries(map).filter(([,words])=>words.some(word=>value.includes(word))).map(([theme])=>theme);
  return result.length?result:['Tributos Federais'];
}

function metaContent(html,property){
  const escaped=property.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const patterns=[
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`,'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`,'i')
  ];
  for(const pattern of patterns){const match=html.match(pattern);if(match)return clean(match[1])}
  return '';
}

async function articlePreview(url,fallback=''){
  try{
    const html=await fetchText(url);
    const description=metaContent(html,'description')||metaContent(html,'og:description')||metaContent(html,'twitter:description');
    return description.slice(0,320);
  }catch{return clean(fallback).slice(0,320)}
}

function make(source,title,summary,url,publishedAt){
  return {id:crypto.createHash('sha256').update(source.id+url).digest('hex').slice(0,16),capturedAt:new Date().toISOString(),sourceId:source.id,sourceBrand:source.brand,sourceName:source.name,category:source.category,title:clean(title),summary:clean(summary).slice(0,320),url,publishedAt,themes:classify(title+' '+summary)};
}

let news=[];
const sourceStatus=[];
for(const source of sources){
  let count=0,error='';
  try{
    const raw=await fetchText(source.rss||source.portal);
    const seen=new Set();
    if(source.rss){
      for(const block of raw.match(/<item\b[\s\S]*?<\/item>/gi)||[]){
        const title=tag(block,'title'),url=tag(block,'link');
        if(!title||!url||seen.has(url))continue;
        seen.add(url);
        const summary=tag(block,'description')||tag(block,'content:encoded');
        news.push(make(source,title,summary,url,tag(block,'pubDate')));
        if(++count>=18)break;
      }
    }else{
      const candidates=[];
      for(const match of raw.matchAll(source.pattern)){
        const url=absolute(match[1],source.portal),title=clean(match[2]);
        if(title.length<12||seen.has(url))continue;
        seen.add(url);
        const context=clean(raw.slice(Math.max(0,match.index-160),Math.min(raw.length,match.index+match[0].length+300)));
        const publishedAt=(context.match(/\b\d{1,2}\/\d{1,2}\/\d{4}(?:\s*[|\-–]\s*\d{1,2}(?::|h)\d{2}(?:min)?)?/i)||[])[0]||'';
        candidates.push({url,title,publishedAt,context:context.replace(title,'')});
        if(candidates.length>=12)break;
      }
      for(const candidate of candidates){
        const summary=await articlePreview(candidate.url,candidate.context);
        news.push(make(source,candidate.title,summary,candidate.url,candidate.publishedAt));
        count++;
      }
    }
  }catch(exception){error=String(exception.message||exception).slice(0,180)}
  sourceStatus.push({id:source.id,brand:source.brand,name:source.name,category:source.category,description:source.description,logo:source.logo,portal:source.portal,count,lastUpdated:new Date().toISOString(),error});
}

news=[...new Map(news.filter(item=>item.title&&item.url).map(item=>[item.url,item])).values()];
let previous={news:[]};
try{previous=JSON.parse(await fs.readFile('docs/data/noticias.json','utf8'))}catch{}
if(!news.length)news=previous.news||[];
await fs.writeFile('docs/data/noticias.json',JSON.stringify({updatedAt:new Date().toISOString(),sources:sourceStatus,news},null,2));
console.log(`${news.length} conteúdos capturados.`);
