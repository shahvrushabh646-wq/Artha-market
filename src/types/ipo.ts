export interface PriceBand {
  min: number;
  max: number;
}

export interface SubscriptionCategory {
  category: string;
  times: number;
}

export interface Subscription {
  overall: number;
  categories: SubscriptionCategory[];
  source: string;
  updatedAt: string;
}

export interface GMPSource {
  source: string;
  gmp: number;
  gmpPercent: number;
  asOf: string;
  url: string;
}

export interface GMP {
  median: number;
  medianPercent: number;
  sources: GMPSource[];
  updatedAt: string;
}

export interface Business {
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

export interface Customers {
  b2b: boolean;
  b2c: boolean;
  domesticMarket: boolean;
  exportMarket: boolean;
  customerConcentration: string;
  categories: string[];
  industriesServed: string[];
  geographicPresence: string[];
  countries: string[];
  source: string;
}

export interface RevenueSource {
  segment: string;
  amount: number;
  percentage: number;
}

export interface RevenueSources {
  sources: RevenueSource[];
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

export interface Objects {
  objects: IPOObject[];
  source: string;
}

export interface Risk {
  risk: string;
  category: string;
}

export interface Risks {
  risks: Risk[];
  source: string;
}

export interface Registrar {
  name: string;
  email: string;
  phone: string;
}

export interface LeadManagers {
  names: string[];
  source: string;
}

export interface SponsorBank {
  name: string;
}

export interface MarketMaker {
  name: string;
}

export interface Document {
  type: string;
  label: string;
  url: string;
  source: string;
}

export interface IPO {
  id: string;
  companyName: string;
  normalizedName: string;
  ipoType: "SME" | "Mainboard";
  exchange: string;
  status: "upcoming" | "open" | "closed" | "listed";
  openDate: string;
  closeDate: string;
  listingDate: string;
  priceBand: PriceBand;
  faceValue: number;
  lotSize: number;
  minimumInvestment: number;
  issueSize: number;
  issueType: string;
  totalSharesOffered: number;
  freshIssue: { amount: number; shares: number };
  offerForSale: { amount: number; shares: number };
  promoterHolding: { preIssue: number; postIssue: number };
  subscription: Subscription;
  gmp: GMP;
  business: Business;
  customers: Customers;
  revenueSources: RevenueSources;
  financials: Financials;
  objects: Objects;
  risks: Risks;
  registrar: Registrar;
  leadManagers: LeadManagers;
  sponsorBank: SponsorBank;
  marketMaker?: MarketMaker;
  documents: Document[];
}