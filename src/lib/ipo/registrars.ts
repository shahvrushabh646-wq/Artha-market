import { isHttpUrl } from "./text";

const REGISTRAR_LINKS: Array<{ match: RegExp; url: string; name: string }> = [
  { match: /mufg|link\s*intime|linkintime/i, url: "https://in.mpms.mufg.com/Initial_Offer/public-issues.html", name: "MUFG Intime" },
  { match: /kfin|karvy/i, url: "https://kosmic.kfintech.com/ipostatus", name: "KFin Technologies" },
  { match: /bigshare/i, url: "https://ipo.bigshareonline.com/IPO_Status.html", name: "Bigshare" },
  { match: /cameo/i, url: "https://wisdom.cameoindia.com", name: "Cameo" },
  { match: /skyline/i, url: "https://www.skylinerta.com/ipo.php", name: "Skyline" },
  { match: /purva/i, url: "https://www.purvashare.com/investor-service/ipo-query", name: "Purva Sharegistry" },
  { match: /maashitla/i, url: "https://maashitla.com/allotment-status", name: "Maashitla" },
  { match: /integrated/i, url: "https://www.integratedregistry.in", name: "Integrated Registry" },
];

export function allotmentUrlForRegistrar(registrar: string | null, explicitUrl?: string | null): string | null {
  if (isHttpUrl(explicitUrl)) return explicitUrl.trim();
  if (!registrar) return null;
  const hit = REGISTRAR_LINKS.find((r) => r.match.test(registrar));
  return hit?.url ?? null;
}

export const NSE_IPO_PAGE = "https://www.nseindia.com/market-data/all-upcoming-issues-ipo";
export const BSE_IPO_PAGE = "https://www.bseindia.com/markets/publicIssues/IPOIssues_new.aspx";
export const SEBI_PUBLIC_ISSUES = "https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=3&ssid=15&smid=11";
