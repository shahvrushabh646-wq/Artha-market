import { cached, cachePeek } from "./cache";
import { settle } from "./http";
import { dedupeIpos, mergeIpo } from "./merge";
import { BSE_IPO_PAGE, NSE_IPO_PAGE } from "./registrars";
import { fetchChittorgarhDetail, fetchChittorgarhIndex, matchChittorgarhUrl } from "./sources/chittorgarh";
import { fetchIpoWatchGmp, matchGmp } from "./sources/ipowatch-gmp";
import { applyPatch, fetchNseCurrent, fetchNseDetail, fetchNsePastRecent, fetchNseUpcoming } from "./sources/nse";
import { estimatedListing } from "./gmp-math";
import { ipoStatus, shouldKeepInUniverse } from "./status";
import { uniqueStrings } from "./text";
import type { IpoRecord } from "./types";

const LIST_TTL=45000;
function attachGmp(ipo:IpoRecord,quotes:Awaited<ReturnType<typeof fetchIpoWatchGmp>>){const m=matchGmp(quotes,ipo.name,ipo.priceHigh);if(!m)return ipo;ipo.gmpRs=m.rs;ipo.gmpPct=m.pct;ipo.gmpSources=[{source:m.quote.source,url:m.quote.url,pct:m.pct,rs:m.rs,asOf:m.quote.asOf}];ipo.gmpVerifiedSources=[m.quote.source];ipo.gmpHistory=[m.point];ipo.fieldSources.gmpRs={source:m.quote.source,url:m.quote.url,timestamp:m.quote.asOf,confidence:"unofficial"};ipo.verifiedSources=uniqueStrings([...ipo.verifiedSources,m.quote.source]);ipo.sourceUrls=uniqueStrings([...ipo.sourceUrls,m.quote.url]);return ipo;}
function attachSecondary(ipo:IpoRecord,index:Awaited<ReturnType<typeof fetchChittorgarhIndex>>){const u=matchChittorgarhUrl(index,ipo.name);if(u){ipo.chittorgarhUrl=u;ipo.sourceUrls=uniqueStrings([...ipo.sourceUrls,u]);}if(!ipo.nsePageUrl&&ipo.nseSymbol)ipo.nsePageUrl=NSE_IPO_PAGE;if(!ipo.bsePageUrl&&(ipo.exchange==="BSE India"||ipo.exchange==="BOTH"))ipo.bsePageUrl=BSE_IPO_PAGE;return ipo;}
async function uncached():Promise<IpoRecord[]>{const[current,upcoming,past,gmp,index]=await Promise.all([settle(fetchNseCurrent(),[]),settle(fetchNseUpcoming(),[]),settle(fetchNsePastRecent(),[]),settle(fetchIpoWatchGmp(),[]),settle(fetchChittorgarhIndex(),[])]);return dedupeIpos([...current,...upcoming,...past]).filter(x=>shouldKeepInUniverse(x)).map(x=>attachGmp(x,gmp)).map(x=>attachSecondary(x,index)).sort((a,b)=>({OPEN:0,UPCOMING:1,CLOSED:2}[ipoStatus(a)]-{OPEN:0,UPCOMING:1,CLOSED:2}[ipoStatus(b)])||(a.openDate??"").localeCompare(b.openDate??"")||a.name.localeCompare(b.name));}
export async function loadIpoUniverse(){try{return await cached("ipo:universe",LIST_TTL,uncached);}catch{return cachePeek<IpoRecord[]>("ipo:universe")??[];}}
export async function loadIpoFast(id:string){const list=await loadIpoUniverse(),base=list.find(x=>x.id===id);if(!base)return null;const clone:IpoRecord={...base,fieldSources:{...base.fieldSources},documents:[...base.documents],subscriptionCategories:[...base.subscriptionCategories],financials:[...base.financials],objects:[...base.objects],risks:[...base.risks],leadManagers:[...base.leadManagers],promoters:[...base.promoters]};if(clone.nseSymbol)try{const detail=await Promise.race([fetchNseDetail(clone.nseSymbol,clone.type),new Promise<null>(r=>setTimeout(()=>r(null),9000))]);if(detail)applyPatch(clone,detail,"NSE India",NSE_IPO_PAGE);}catch{clone.errors=uniqueStrings([...clone.errors,"NSE detail unavailable"]);}return clone;}
export async function loadIpoEnriched(id:string){const fast=await loadIpoFast(id);if(!fast)return null;const ipo=fast;try{let u=ipo.chittorgarhUrl;if(!u){const idx=await settle(fetchChittorgarhIndex(),[]);u=matchChittorgarhUrl(idx,ipo.name);}if(u){const detail=await Promise.race([fetchChittorgarhDetail(u),new Promise<null>(r=>setTimeout(()=>r(null),10000))]);if(detail){applyPatch(ipo,detail,"Chittorgarh",u);ipo.chittorgarhUrl=u;}}}catch{ipo.errors=uniqueStrings([...ipo.errors,"Secondary research source unavailable"]);}try{attachGmp(ipo,await fetchIpoWatchGmp());}catch{}ipo.verifiedAt=new Date().toISOString();return ipo;}
export function listingEstimate(ipo:IpoRecord){return estimatedListing(ipo.priceHigh,ipo.gmpRs);}
export function mergeFastAndEnriched(fast:IpoRecord|null,enriched:IpoRecord|null){if(!fast&&!enriched)return null;if(!fast)return enriched;if(!enriched)return fast;return mergeIpo(fast,enriched);}
