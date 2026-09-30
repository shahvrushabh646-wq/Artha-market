export type IPOType = "Mainboard" | "SME";
export type IPOStatus = "upcoming" | "open" | "closed" | "listed";

export interface CategorySubscription {
  category: string;
  times?: number;
  sharesBid?: number;
  sharesOffered?: number;
}

export interface Subscription {
  overall: number;
  categories: CategorySubscription[];
  source: string;
  updatedAt: string;
}

export interface GMPSource {
  source: string;
  gmp: number;
  gmpPercent: number;
  asOf: string;
  url?: string;
}

export interface GMPData {
  median: number;
  medianPercent: number;
  sources: GMPSource[];
  updatedAt: string;
}

export interface BusinessInfo {
  industry: string;
  sector: string;
  businessModel: string;
  description: string;
  products: string[];
  services: string[];
  registeredOffice: string;
  corporateOffice: string;
  source: string;
}

export interface CustomerInfo {
  b2b: boolean;
  b2c: boolean;
  domesticMarket: boolean;
  exportMarket: boolean;
  customerConcentration?: string;
  categories: string[];
  industriesServed: string[];
  geographicPresence: string[];
  countries: string[];
  source: string;
}

export interface RevenueSegment {
  segment: string;
  amount: number;
  percentage: number;
}

export interface RevenueSources {
  sources: RevenueSegment[];
  domesticPercent: number;
  exportPercent: number;
  source: string;
}

export interface FinancialYear {
  year: string;
  revenue: number;
  profit: number;
  eps: number;
  ebitda: number;
  roe: number;
}

export interface Financials {
  years: FinancialYear[];
  source: string;
}

export interface IPOObject {
  purpose: string;
  amount: number;
}

export interface ObjectsOfIssue {
  objects: IPOObject[];
  source: string;
}

export interface RiskFactor {
  risk: string;
  category: string;
}

export interface RiskFactors {
  risks: RiskFactor[];
  source: string;
}

export interface Registrar {
  name: string;
  email?: string;
  phone?: string;
}

export interface LeadManagers {
  names: string[];
  source: string;
}

export interface DocumentLink {
  type: string;
  label: string;
  url: string;
  source: string;
}

export interface IPO {
  id: string;
  companyName: string;
  normalizedName: string;
  ipoType: IPOType;
  nseSymbol?: string;
  bseSymbol?: string;
  bseScripCode?: string;
  exchange: string;
  status: IPOStatus;
  openDate: string;
  closeDate: string;
  listingDate?: string;
  priceBand: { min: number; max: number };
  faceValue?: number;
  lotSize?: number;
  minimumInvestment?: number;
  issueSize?: number;
  issueType?: string;
  totalSharesOffered?: number;
  freshIssue?: { amount?: number; shares?: number };
  offerForSale?: { amount?: number; shares?: number };
  promoterHolding?: { preIssue?: number; postIssue?: number };
  subscription?: Subscription;
  gmp?: GMPData;
  business?: BusinessInfo;
  customers?: CustomerInfo;
  revenueSources?: RevenueSources;
  financials?: Financials;
  objects?: ObjectsOfIssue;
  risks?: RiskFactors;
  registrar?: Registrar;
  leadManagers?: LeadManagers;
  sponsorBank?: { name: string };
  marketMaker?: { name: string };
  documents?: DocumentLink[];
  officialWebsite?: string;
  moneycontrolUrl?: string;
  verifiedSources: string[];
  sourceUrls: string[];
  verifiedAt: string;
  isSampleData?: boolean;
}
