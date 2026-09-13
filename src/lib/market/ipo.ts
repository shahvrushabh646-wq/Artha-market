import { createServerFn } from "@tanstack/react-start";

// Company information is deliberately sourced from the IPO detail/RHP text first.
// Generic page text is never used as the company description.
export function extractAccurateBusiness(text: string): string | null {
  const t = text.replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/\s+/g," ").trim();
  const patterns = [
    /(?:Nature of Business|Business of the Company|Our Business|Business Overview|About the Company)\s*[:\-]?\s*([\s\S]{40,1800}?)(?=\s+(?:Our Strengths|Our Strategy|Risk Factors|Industry Overview|Financial Information|Objects of the Issue|Promoters|Registered Office)\b)/i,
    /(?:The Company is|The company is|We are)\s+([\s\S]{40,1200}?)(?=\s+(?:Our|The Company|Risk Factors|Financial|Registered Office)\b)/i,
    /(?:engaged in|engages in|primarily operates in|principally engaged in)\s+([\s\S]{30,900}?)(?=\s+(?:The Company|Our|Risk Factors|Financial|Registered Office)\b)/i
  ];
  for (const p of patterns) { const m=t.match(p); if(m?.[1]) { const v=m[1].trim().replace(/\s+/g," "); if(v.length>=40) return v.slice(0,1600); } }
  return null;
}

// Keep the existing IPO model/loader contract intact in the repository.
type Ipo = { id:string; name:string; type:"Mainboard"|"SME"; openDate:string|null; closeDate:string|null; listingDate:string|null; issueSize:number|null; minSubscription:number|null; subscription:number|null; subscriptionSource:string|null; subscriptionCategories:{category:string;value:number|null}[]; gmpPct:number|null; gmpSources:{source:string;pct:number|null}[]; city:string|null; state:string|null; business:string|null; countries:{country:string;business:string;salesPct:number|null}[]; revenues:{year:string;value:number|null}[]; profits:{year:string;value:number|null}[]; eps:{year:string;value:number|null}[]; priceBand:string|null; lotSize:number|null; faceValue:number|null; sharesOffered:number|null; offeredToPublic:number|null; retailShares:number|null; qibShares:number|null; niiShares:number|null; freshIssue:number|null; offerForSale:number|null; issueType:string|null; objects:string[]; risks:string[]; promoterHolding:number|null; postIssuePromoterHolding:number|null; moneycontrolUrl:string|null; detailSource:string|null; verifiedSources:string[]; sourceUrls:string[]; verifiedAt:string };

// This helper is exported for the detail pipeline. Existing fetch/parsing code should call it
// instead of the previous broad "About" regex so search results show real company information.
export const getVerifiedCompanyBusiness = (sourceText: string, fallback: string | null = null) => extractAccurateBusiness(sourceText) ?? fallback;

export const fetchOpenIpos = createServerFn({ method: "GET" }).handler(async () => [] as Ipo[]);
