import fs from 'node:fs/promises';
import crypto from 'node:crypto';
const feeds=[
 {name:'Portal Contábeis - Notícias',url:'https://www.contabeis.com.br/rss/noticias/'},
 {name:'Portal Contábeis - Legislação',url:'https://www.contabeis.com.br/rss/legislacao/'}
];
const clean=s=>(s||'').replace(/<!\[CDATA\[|\]\]>/g,'').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g,' ').trim();
const tag=(block,name)=>{const m=block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`,'i'));return m?clean(m[1]):''};
const classify=(title,summary)=>{const b=(title+' '+summary).toLowerCase();const map={'Reforma Tributária':['reforma tributária','ibs','cbs'],'Simples Nacional':['simples nacional','mei'],'PIS/Cofins':['pis','cofins'],'Documentos fiscais':['nf-e','nfs-e','sped','nota fiscal'],'ICMS':['icms','confaz']};const temas=Object.entries(map).filter(([,w])=>w.some(x=>b.includes(x))).map(([k])=>k);return {temas:temas.length?temas:['Outros'],prioridade:['prazo','obrigatório','entra em vigor','alerta'].some(x=>b.includes(x))?'alta':'normal'}};
const noticias=[];const erros=[];
for(const feed of feeds){try{const r=await fetch(feed.url,{headers:{'user-agent':'RadarFiscalPublico/1.0'},signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error(`HTTP ${r.status}`);const xml=await r.text();for(const block of xml.match(/<item\b[\s\S]*?<\/item>/gi)||[]){const titulo=tag(block,'title'),url=tag(block,'link'),resumo=tag(block,'description').slice(0,420);if(!titulo||!url)continue;const c=classify(titulo,resumo);noticias.push({id:crypto.createHash('sha256').update(url).digest('hex').slice(0,16),titulo,resumo,url,fonte:feed.name,publicadoEm:tag(block,'pubDate'),...c})}}catch(e){erros.push({fonte:feed.name,erro:String(e.message||e).slice(0,180)})}}
const unique=[...new Map(noticias.map(x=>[x.url,x])).values()].sort((a,b)=>Date.parse(b.publicadoEm||0)-Date.parse(a.publicadoEm||0)).slice(0,60);
const previous=JSON.parse(await fs.readFile('docs/data/noticias.json','utf8').catch(()=>'{"noticias":[]}'));
const final=unique.length?unique:(previous.noticias||[]);
await fs.writeFile('docs/data/noticias.json',JSON.stringify({atualizadoEm:new Date().toISOString(),total:final.length,noticias:final,erros,usouCache:!unique.length},null,2));
console.log(`Gerado: ${final.length} notícias; ${erros.length} falhas.`);
