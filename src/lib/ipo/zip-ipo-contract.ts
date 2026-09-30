export type IPOStatus = "UPCOMING" | "OPEN" | "CLOSED" | "LISTED" | "upcoming" | "open" | "closed" | "listed";

export interface DocumentLink { type:string; label:string; url:string; source:string; }
export interface Subscription { overall:number; categories:{category:string;times:number}[]; source:string; updatedAt:string; }
export interface GMPData { median?:number; medianPercent?:number; sources:{source:string;gmp:number;gmpPercent:number;asOf:string;url?:string}[]; updatedAt:string; }

export interface IPO {
  id:string; companyName:string; normalizedName:string; ipoType:"Mainboard"|"SME";
  nseSymbol?:string; bseSymbol?:string; bseScripCode?:string; exchange:string;
  status:"upcoming"|"open"|"closed"|"listed"; openDate:string; closeDate:string; listingDate:string;
  priceBand:{min:number;max:number}; faceValue:number; lotSize:number; minimumInvestment:number;
  issueSize:number; issueType:string; totalSharesOffered:number;
  freshIssue:{amount:number;shares:number}; offerForSale:{amount:number;shares:number};
  promoterHolding:{preIssue:number;postIssue:number};
  officialWebsite?:string; rhpUrl?:string; drhpUrl?:string; prospectusUrl?:string;
  documents?:DocumentLink[]; isSampleData?:boolean; lastUpdated?:string;
  subscription?:Subscription; gmp?:GMPData;
  business?:{industry:string;sector:string;businessModel:string;description:string;products:string[];services:string[];locations:string[];registeredOffice:string;corporateOffice:string;source:string};
  customers?:{b2b:boolean;b2c:boolean;domesticMarket:boolean;exportMarket:boolean;customerConcentration?:string;categories:string[];industriesServed:string[];geographicPresence:string[];countries:string[];source:string};
  revenueSources?:{sources:{segment:string;amount:number;percentage:number}[];domesticPercent:number;exportPercent:number;source:string};
  financials?:{years:{year:string;revenue:number;profit:number;eps:number;ebitda:number;roe:number}[];source:string};
  objects?:{objects:{purpose:string;amount:number}[];source:string};
  risks?:{risks:{risk:string;category:string}[];source:string};
  registrar?:{name:string;email?:string;phone?:string};
  leadManagers?:{names:string[];source:string}; sponsorBank?:{name:string}; marketMaker?:{name:string};
  verifiedSources:string[]; sourceUrls:string[]; verifiedAt:string;
}
