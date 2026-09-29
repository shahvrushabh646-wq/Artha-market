export const UNAVAILABLE = "માહિતી ઉપલબ્ધ નથી";
export const FETCHING = "ચકાસણી હેઠળ";
export const IST = "Asia/Kolkata";

export function clean(v: unknown): string {
  return String(v ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&/g, "&")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#8377;|&rsquo;|&ldquo;|&rdquo;|"/g, (m) => {
      if (m === "&#8377;") return "₹";
      if (m === "&rsquo;") return "'";
      if (m === "&ldquo;" || m === "&rdquo;" || m === '"') return '"';
      return m;
    })
    .replace(/\s+/g, " ")
    .trim();
}
export function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).replace(/,/g, "").replace(/%/g, "").replace(/₹/g, "").trim();
  if (!s || /^(-+|na|n\/a|nil|null|--)$/i.test(s)) return null;
  const x = Number(s); return Number.isFinite(x) ? x : null;
}
export function indiaToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA",{timeZone:IST,year:"numeric",month:"2-digit",day:"2-digit"}).format(now);
}
const MONTHS=["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
export function parseDate(v: unknown): string | null {
  const s=clean(v); if(!s||/^(-+|na|n\/a|tbd)$/i.test(s))return null;
  const iso=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if(iso)return `${iso[1]}-${String(Number(iso[2])).padStart(2,"0")}-${String(Number(iso[3])).padStart(2,"0")}`;
  const dmyName=s.match(/(\d{1,2})[-/ ]([A-Za-z]{3,})[-/, ]+(\d{4})/);
  if(dmyName){const mi=MONTHS.indexOf(dmyName[2].slice(0,3).toLowerCase());if(mi>=0)return `${dmyName[3]}-${String(mi+1).padStart(2,"0")}-${String(Number(dmyName[1])).padStart(2,"0")}`;}
  const monthFirst=s.match(/([A-Za-z]{3,})\s+(\d{1,2}),?\s+(\d{4})/);
  if(monthFirst){const mi=MONTHS.indexOf(monthFirst[1].slice(0,3).toLowerCase());if(mi>=0)return `${monthFirst[3]}-${String(mi+1).padStart(2,"0")}-${String(Number(monthFirst[2])).padStart(2,"0")}`;}
  const dmy=s.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if(dmy)return `${dmy[3]}-${String(Number(dmy[2])).padStart(2,"0")}-${String(Number(dmy[1])).padStart(2,"0")}`;
  return null;
}
export function slugId(v:string):string{return clean(v).toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")||"ipo";}
export function normalizeCompanyName(v:unknown):string{return clean(v).toLowerCase().replace(/['’]/g,"").replace(/\b(limited|ltd|private|pvt|company|corporation|inc|ipo)\b/g," ").replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();}
export function namesMatch(a:unknown,b:unknown):boolean{const x=normalizeCompanyName(a),y=normalizeCompanyName(b);return !!x&&!!y&&(x===y||x.includes(y)||y.includes(x));}
export function parsePriceBand(v:unknown):{text:string|null;low:number|null;high:number|null}{const s=clean(v);if(!s)return{text:null,low:null,high:null};const m=s.match(/(?:Rs\.?|₹)?\s*([\d,]+(?:\.\d+)?)\s*(?:-|to|–|—)\s*(?:Rs\.?|₹)?\s*([\d,]+(?:\.\d+)?)/i);if(m){const low=num(m[1]),high=num(m[2]);return{text:low!=null&&high!=null?`₹${low.toLocaleString("en-IN")} - ₹${high.toLocaleString("en-IN")}`:s,low,high};}const single=s.match(/(?:Rs\.?|₹)\s*([\d,]+(?:\.\d+)?)/i);if(single){const n=num(single[1]);return{text:n!=null?`₹${n.toLocaleString("en-IN")}`:s,low:n,high:n};}return{text:s,low:null,high:null};}
export function decodeEntities(s:string):string{return s.replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n))).replace(/&/g,"&").replace(/</g,"<").replace(/>/g,">").replace(/"/g,'"').replace(/&nbsp;/gi," ").replace(/&#8377;/g,"₹");}
export function uniqueStrings(values:Array<string|null|undefined>):string[]{const out:string[]=[];for(const v of values){const s=clean(v);if(s&&!out.includes(s))out.push(s);}return out;}
export function domainOf(url:string):string{try{return new URL(url).hostname.replace(/^www\./,"").toLowerCase();}catch{return "";}}
export function isHttpUrl(v:unknown):v is string{return typeof v==="string"&&/^https?:\/\//i.test(v.trim());}
