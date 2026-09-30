  if(corporateOffice)ipo.corporateOffice=corporateOffice;
  if(businessModel)ipo.businessModel=businessModel;
  if(servicesText)ipo.services=[...new Set(servicesText.split(/,|;|\|/).map(clean).filter(x=>x.length>2))].slice(0,12);
  if(office){
    const parts=office.split(",").map(x=>x.trim()).filter(Boolean);
    if(parts.length>1)ipo.city=parts[parts.length-2]||ipo.city;
    ipo.state=parts[parts.length-1]||ipo.state;
  }
  const sector=firstText(all,[/(?:industry|sector|industry classification)[:\s]+([^\n]{10,160})/i]);
  if(sector)ipo.sector=sector;
  if(sector && !ipo.segments.length)ipo.segments=[sector];
  const productText=firstText(all,[/(?:products?|product portfolio|product range|key products?)[:\s]+([^\n]{20,500})/i]);
  if(productText){
    ipo.products=[...new Set([...ipo.products,...productText.split(/,|;|\|/).map(clean).filter(x=>x.length>2)])].slice(0,15);
    ipo.segments=[...new Set([...ipo.segments,productText])];
  }
  const rev=numberList(all,[/(?:revenue from operations|revenue|turnover)[^\d]{0,80}([\d,]+(?:\.\d+)?)\s*(?:crore|cr)/gi]);  const ebitda=numberList(all,[/(?:EBITDA|EBITDA margin)[^\d]{0,80}([\d,]+(?:\.\d+)?)\s*(?:crore|cr|%)/gi]);
  const roe=numberList(all,[/(?:ROE|return on equity)[^\d]{0,80}([\d,]+(?:\.\d+)?)\s*%/gi]);
  const roce=numberList(all,[/(?:ROCE|return on capital employed)[^\d]{0,80}([\d,]+(?:\.\d+)?)\s*%/gi]);
  const debt=numberList(all,[/(?:total debt|net debt|borrowings|debt)[^\d]{0,80}([\d,]+(?:\.\d+)?)\s*(?:crore|cr)/gi]);
  const netWorth=numberList(all,[/(?:net worth|networth)[^\d]{0,80}([\d,]+(?:\.\d+)?)\s*(?:crore|cr)/gi]);
  const assets=numberList(all,[/(?:total assets|assets)[^\d]{0,80}([\d,]+(?:\.\d+)?)\s*(?:crore|cr)/gi]);

  const prof=numberList(all,[/(?:profit after tax|profit for the year|net profit|PAT)[^\d]{0,80}([\d,]+(?:\.\d+)?)\s*(?:crore|cr)/gi]);
  const eps=numberList(all,[/(?:basic EPS|diluted EPS|earnings per share|EPS)[^\d]{0,60}([\d,]+(?:\.\d+)?)/gi]);
  const years=[...new Set([...all.matchAll(/\b20(?:2[2-9]|3[0-9])\b/g)].map(m=>m[0]))].slice(-3);
  if(rev.length)ipo.revenues=rev.map((value,i)=>({year:years[years.length-rev.length+i]??String(i+1),value}));
  if(prof.length)ipo.profits=prof.map((value,i)=>({year:years[years.length-prof.length+i]??String(i+1),value}));
  if(eps.length)ipo.eps=eps.map((value,i)=>({year:years[years.length-eps.length+i]??String(i+1),value}));
  const finYears=years.length?years:["FY1","FY2","FY3"];
  ipo.financials=finYears.map((year,i)=>({year,revenue:rev[i]??null,ebitda:ebitda[i]??null,pat:prof[i]??null,eps:eps[i]??null,debt:debt[i]??null,netWorth:netWorth[i]??null,assets:assets[i]??null,roe:roe[i]??null,roce:roce[i]??null,source:sourceName(hits[0]?.url??"")})).filter(x=>x.revenue!=null||x.pat!=null||x.eps!=null||x.ebitda!=null||x.debt!=null||x.netWorth!=null||x.assets!=null||x.roe!=null||x.roce!=null);
  const freshAmount=firstNumber(all,[/(?:fresh issue|fresh equity issue)[^₹\d]{0,80}(?:₹|Rs\.?\s*)?([\d,]+(?:\.\d+)?)\s*(?:crore|cr)/i]);
  const freshShares=firstNumber(all,[/(?:fresh issue|fresh equity issue)[^\d]{0,120}([\d,]+(?:\.\d+)?)\s*(?:equity )?shares?/i]);
  const ofsAmount=firstNumber(all,[/(?:offer for sale|OFS)[^₹\d]{0,80}(?:₹|Rs\.?\s*)?([\d,]+(?:\.\d+)?)\s*(?:crore|cr)/i]);
  const ofsShares=firstNumber(all,[/(?:offer for sale|OFS)[^\d]{0,120}([\d,]+(?:\.\d+)?)\s*(?:equity )?shares?/i]);
  if(freshAmount!=null)ipo.freshIssue=freshAmount;
  if(freshShares!=null)ipo.freshIssueShares=freshShares;
  if(ofsAmount!=null)ipo.offerForSale=ofsAmount;
  if(ofsShares!=null)ipo.offerForSaleShares=ofsShares;
  const objects=[...all.matchAll(/(?:objects of the issue|utilisation of proceeds|use of proceeds|objects of offer)(?:.|\\n){0,80}?(?:₹|Rs\.?)[^\\n]{0,80}?([^\\n]{20,500})/gi)].slice(0,8).map(m=>clean(m[1]));
  const objectHead=all.match(/(?:objects of the issue|utilisation of proceeds|use of proceeds|objects of offer)([\\s\\S]{0,1800})/i);
  if(objectHead?.[1])objects.push(...objectHead[1].split(/\\n/).map(clean).filter(x=>x.length>25&&/₹|Rs\.?|capital|corporate|facility|repay|working capital/i.test(x)).slice(0,8));
  const risks=[...all.matchAll(/(?:key risks|risk factors|risk factors and mitigation)([\\s\\S]{0,1200})/gi)].slice(0,4).flatMap(m=>m[1].split(/\\n/).map(clean).filter(x=>x.length>35)).slice(0,8);
  if(objects.length)ipo.objects=[...new Set(objects)].slice(0,8);
  if(risks.length)ipo.risks=[...new Set(risks)].slice(0,8);

  const promoters = [
    ...[...all.matchAll(/(?:promoters?|promoter group)[^\n:]*[:\-]\s*([^\n]{20,500})/gi)].slice(0,3).map(m=>clean(m[1]))
  ];
  const segments = [
    ...[...all.matchAll(/(?:business segments?|segments?)[^\n:]*[:\-]\s*([^\n]{20,500})/gi)].slice(0,3).map(m=>clean(m[1]))