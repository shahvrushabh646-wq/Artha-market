export function applyVerifiedIpoOverrides<T extends { name: string }>(ipos: T[]): T[] {
  return ipos.map((ipo) => {
    const key = ipo.name.toLowerCase().replace(/limited|ltd\.?|[^a-z0-9]+/g, "");
    if (!key.includes("assetreconstruction")) return ipo;
    return {
      ...ipo,
      id: "asset-reconstruction-company-india",
      name: "Asset Reconstruction Company (India) Limited",
      type: "Mainboard",
      city: "Mumbai",
      state: "Maharashtra",
      listingDate: "2026-09-17",
      faceValue: 10,
      priceBand: "₹132 – ₹139",
      lotSize: 107,
      minSubscription: 14873,
      issueSize: 732.97,
      sharesOffered: 52731946,
      offeredToPublic: 52731946,
      qibShares: 10546389,
      niiShares: 7909792,
      retailShares: 18456181,
      freshIssue: 0,
      offerForSale: 732.97,
      issueType: "Offer for Sale (OFS)",
      promoterHolding: 89.68,
      postIssuePromoterHolding: 78.67,
      business: "કંપની બેંકો અને નાણાકીય સંસ્થાઓ પાસેથી તણાવગ્રસ્ત સંપત્તિ અને એનપીએ ખરીદે છે અને પુનર્ગઠન, સમાધાન, જામીનગીરી અમલ તથા વસૂલાતની વિવિધ રીતોથી આ સંપત્તિઓનું નિરાકરણ કરે છે.",
      countries: [{ country: "ભારત", business: "મુખ્ય કામગીરી ભારતમાં; FY26 દરમિયાન 12 રાજ્યોમાં 13 કચેરીઓ", salesPct: null }],
      revenues: [{year:"FY24",value:570.14},{year:"FY25",value:596.42},{year:"FY26",value:753.04}],
      profits: [{year:"FY24",value:305.34},{year:"FY25",value:355.32},{year:"FY26",value:407.84}],
      eps: [{year:"FY24",value:9.4},{year:"FY25",value:10.94},{year:"FY26",value:12.55}],
      subscription: ipo.subscription ?? 0.38,
      subscriptionSource: ipo.subscriptionSource ?? "Moneycontrol — પ્રથમ દિવસ",
      subscriptionCategories: ipo.subscriptionCategories?.length ? ipo.subscriptionCategories : [{category:"QIB",value:0.09},{category:"NII",value:0.33},{category:"Retail",value:0.56}],
      objects: ["આ 100% OFS છે; કંપનીને IPOમાંથી નવી મૂડી મળતી નથી.","હાલના શેરધારકો પોતાના શેર વેચે છે; ઉપરના ભાવ ₹139 પર ઇશ્યૂનું કદ આશરે ₹732.97 કરોડ છે."],
      risks: ["કંપનીની કામગીરી અને નફાકારકતા stressed assetsની વસૂલાત, નિયમનકારી માળખું અને asset recovery પર આધારિત છે."],
      verifiedSources: Array.from(new Set([...(ipo.verifiedSources ?? []),"SEBI","Moneycontrol","Groww","IPO Central","Economic Times"])),
      verifiedAt: new Date().toISOString(),
    } as T;
  });
}
