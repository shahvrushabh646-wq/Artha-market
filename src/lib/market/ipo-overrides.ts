export function applyVerifiedIpoOverrides<T extends { name: string }>(ipos: T[]): T[] {
  return ipos.map((ipo) => {
    const key = ipo.name.toLowerCase().replace(/limited|ltd\.?|private|pvt\.?|[^a-z0-9]+/g, "");

    if (key.includes("assetreconstruction")) {
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
    }

    if (key.includes("veegalanddevelopers")) {
      return {
        ...ipo,
        id: "veegaland-developers",
        name: "Veegaland Developers Limited",
        type: "Mainboard",
        openDate: "2026-09-10",
        closeDate: "2026-09-15",
        listingDate: "2026-09-18",
        issueSize: 210,
        minSubscription: 14980,
        subscription: 1.15,
        subscriptionSource: "NSE/ET — Day 2 snapshot",
        subscriptionCategories: [
          {category:"QIB",value:0.45},
          {category:"NII",value:0.79},
          {category:"Retail",value:1.52}
        ],
        gmpPct: 17.86,
        gmpSources: [
          {source:"IPO Station",pct:17.86},
          {source:"Financial Express",pct:17.86}
        ],
        city: "Kochi",
        state: "Kerala",
        business: "કેરળમાં મધ્યમ-પ્રીમિયમ, પ્રીમિયમ અને લક્ઝરી રહેણાંક પ્રોજેક્ટ્સનું આયોજન, વિકાસ અને વેચાણ કરતી રિયલ એસ્ટેટ ડેવલપમેન્ટ કંપની.",
        countries: [{country:"ભારત",business:"મુખ્ય કામગીરી ભારતમાં; કેરળમાં રહેણાંક પ્રોજેક્ટ્સ",salesPct:null}],
        priceBand: "₹130 – ₹140",
        lotSize: 107,
        faceValue: 10,
        sharesOffered: 15000000,
        offeredToPublic: 15000000,
        retailShares: 5250000,
        qibShares: 3000000,
        niiShares: 2250000,
        freshIssue: 210,
        offerForSale: 0,
        issueType: "Fresh Issue",
        objects: [
          "ચાલુ રહેણાંક પ્રોજેક્ટ્સના વિકાસ ખર્ચનો એક ભાગ પૂરો કરવો.",
          "જમીનના અજ્ઞાત/ભવિષ્યના અધિગ્રહણ માટે ફંડિંગ.",
          "સામાન્ય કોર્પોરેટ હેતુઓ."
        ],
        risks: [
          "રિયલ એસ્ટેટ બજાર, પ્રોજેક્ટ execution અને કેરળમાં માંગ પર નિર્ભરતા.",
          "જમીન અને બાંધકામ ખર્ચમાં વધારો માર્જિનને અસર કરી શકે છે."
        ],
        verifiedSources: Array.from(new Set([...(ipo.verifiedSources ?? []),"Financial Express","Economic Times","Goodreturns","IPO Station","InvestKraft"])),
        sourceUrls: ["https://www.financialexpress.com/market/ipo-news-veegaland-developers-ipo-day-1-issue-subscribed-0-62x-should-you-apply-4336385/","https://www.goodreturns.in/ipo/veegaland-developers-ipo/","https://ipostation.in/ipo/veegaland-developers-ipo-2026"],
        verifiedAt: new Date().toISOString(),
      } as T;
    }

    if (key.includes("panchatvbharat")) {
      return {
        ...ipo,
        id: "panchatv-bharat",
        name: "Panchatv Bharat Limited",
        type: "SME",
        openDate: "2026-09-10",
        closeDate: "2026-09-15",
        listingDate: "2026-09-18",
        issueSize: 24.58,
        minSubscription: 280000,
        subscription: 0.04,
        subscriptionSource: "NSE/BSE — 11 Sep 2026, 5:00 PM snapshot",
        subscriptionCategories: [
          {category:"NII",value:0},
          {category:"Retail",value:0.07}
        ],
        gmpPct: 5,
        gmpSources: [
          {source:"GMPWatch",pct:5},
          {source:"InvestorGain",pct:5}
        ],
        city: "New Delhi",
        state: "Delhi",
        business: "ડેનિમ ફેબ્રિકનું ઉત્પાદન થર્ડ-પાર્ટી મેન્યુફેક્ચરિંગ સુવિધાઓ મારફતે અને સમગ્ર ભારતમાં ડેનિમ ફેબ્રિકનું હોલસેલ વિતરણ.",
        countries: [{country:"ભારત",business:"સમગ્ર ભારતમાં ડેનિમ ફેબ્રિકનું વેચાણ",salesPct:null}],
        revenues: [{year:"FY24",value:39.31},{year:"FY25",value:48.99}],
        profits: [{year:"FY24",value:2.02},{year:"FY25",value:2.83}],
        eps: [],
        priceBand: "₹140",
        lotSize: 1000,
        faceValue: 10,
        sharesOffered: 1756000,
        offeredToPublic: 1668000,
        retailShares: 834000,
        qibShares: 0,
        niiShares: 834000,
        freshIssue: 24.58,
        offerForSale: 0,
        issueType: "Fixed Price - SME",
        objects: [
          "દિલ્હીમાં પ્રોપર્ટી ખરીદવા માટે કેપિટલ એક્સપેન્ડિચર.",
          "વર્કિંગ કેપિટલની જરૂરિયાત પૂરી કરવી.",
          "સામાન્ય કોર્પોરેટ હેતુઓ અને IPO સંબંધિત ખર્ચ."
        ],
        risks: [
          "ડેનિમ ફેબ્રિક માટે દિલ્હી અને ઉત્તર પ્રદેશમાં આવકનું ઊંચું concentration.",
          "થર્ડ-પાર્ટી સપ્લાયર્સ અને મેન્યુફેક્ચરિંગ સુવિધાઓ પર નિર્ભરતા.",
          "FY25-26 અને અગાઉના કેટલાક સમયગાળામાં operating/investing cash-flow સંબંધિત દબાણ."
        ],
        verifiedSources: Array.from(new Set([...(ipo.verifiedSources ?? []),"Business Standard","Zerodha","InvestorGain","GMPWatch","IPO360"])),
        sourceUrls: ["https://www.business-standard.com/markets/ipo/panchatv-bharat-ltd-ipo-93849","https://zerodha.com/ipo/457671/panchatv-bharat/","https://www.investorgain.com/ipo/panchatv-bharat-ipo/1749/","https://www.gmpwatch.in/panchatv-bharat-ipo-gmp-today-grey-market-premium/"],
        verifiedAt: new Date().toISOString(),
      } as T;
    }

    return ipo;
  });
}
