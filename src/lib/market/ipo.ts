import { createServerFn } from "@tanstack/react-start";
import { fetchOpenIposLive } from "./ipo-live";

type Ipo = {
  id:string; name:string; type:"Mainboard"|"SME"; openDate:string|null; closeDate:string|null; listingDate:string|null;
  issueSize:number|null; minSubscription:number|null; subscription:number|null; subscriptionSource:string|null;
  subscriptionCategories:{category:string;value:number|null}[]; gmpPct:number|null; gmpSources:{source:string;pct:number|null}[];
  city:string|null; state:string|null; business:string|null; countries:{country:string;business:string;salesPct:number|null}[];
  revenues:{year:string;value:number|null}[]; profits:{year:string;value:number|null}[]; eps:{year:string;value:number|null}[];
  priceBand:string|null; lotSize:number|null; faceValue:number|null; sharesOffered:number|null; offeredToPublic:number|null;
  retailShares:number|null; qibShares:number|null; niiShares:number|null; freshIssue:number|null; offerForSale:number|null;
  issueType:string|null; objects:string[]; risks:string[]; promoterHolding:number|null; postIssuePromoterHolding:number|null;
  moneycontrolUrl:string|null; detailSource:string|null; verifiedSources:string[]; sourceUrls:string[]; verifiedAt:string;
};

export const fetchOpenIpos = createServerFn({ method:"GET" }).handler(async():Promise<Ipo[]> => {
  return await fetchOpenIposLive({data:{}}) as Ipo[];
});
