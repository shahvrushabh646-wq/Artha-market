import { useState } from "react";
import { IPO } from "@/types/ipo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ExternalLink, Building2, IndianRupee, AlertTriangle, Shield, FileText } from "lucide-react";

interface IPODetailProps {
  ipo: IPO;
}

const formatAmount = (amount: number) => {
  if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(2)} કરોડ`;
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(2)} લાખ`;
  return `₹${amount.toLocaleString("en-IN")}`;
};

const formatNumber = (num: number) => {
  return num.toLocaleString("en-IN");
};

const formatDate = (dateStr: string) => {
  const date = new Date(dateStr);
  return date.toLocaleDateString("gu-IN", { day: "numeric", month: "short", year: "numeric" });
};

const InfoRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between py-2 border-b border-slate-100 last:border-0">
    <span className="text-sm text-slate-600">{label}</span>
    <span className="text-sm font-medium text-slate-900">{value}</span>
  </div>
);

const InfoUnavailable = () => (
  <span className="text-sm text-slate-400 italic">માહિતી ઉપલબ્ધ નથી</span>
);

export function IPODetail({ ipo }: IPODetailProps) {
  const [activeTab, setActiveTab] = useState("q1");

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; className: string }> = {
      open: { label: "ખુલ્લું", className: "bg-green-100 text-green-800" },
      closed: { label: "બંધ", className: "bg-red-100 text-red-800" },
      upcoming: { label: "આગામી", className: "bg-blue-100 text-blue-800" },
      listed: { label: "લિસ્ટેડ", className: "bg-purple-100 text-purple-800" },
    };
    const statusInfo = statusMap[status] || { label: status, className: "bg-slate-100 text-slate-800" };
    return <Badge className={statusInfo.className}>{statusInfo.label}</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">{ipo.companyName}</h2>
              <div className="flex items-center gap-2 mt-2">
                <Badge variant="outline">{ipo.ipoType === "SME" ? "એસએમઈ" : "મેઈનબોર્ડ"}</Badge>
                {getStatusBadge(ipo.status)}
                <Badge variant="outline">{ipo.exchange}</Badge>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm text-slate-600">Price Band</div>
              <div className="text-xl font-bold text-slate-900">₹{ipo.priceBand.min} - ₹{ipo.priceBand.max}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-9 w-full">
          {["q1", "q2", "q3", "q4", "q5", "q6", "q7", "q8", "q9"].map((tab) => (
            <TabsTrigger key={tab} value={tab} className="text-xs">
              {tab.toUpperCase()}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Q1 - Basic Details */}
        <TabsContent value="q1">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Q1 - IPO Basic Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <InfoRow label="કંપની" value={ipo.companyName} />
                  <InfoRow label="IPO પ્રકાર" value={ipo.ipoType === "SME" ? "એસએમઈ" : "મેઈનબોર્ડ"} />
                  <InfoRow label="Exchange" value={ipo.exchange} />
                  <InfoRow label="Status" value={getStatusBadge(ipo.status).props.children as string} />
                  <InfoRow label="Open Date" value={formatDate(ipo.openDate)} />
                  <InfoRow label="Close Date" value={formatDate(ipo.closeDate)} />
                  <InfoRow label="Listing Date" value={ipo.listingDate ? formatDate(ipo.listingDate) : "માહિતી ઉપલબ્ધ નથી"} />
                </div>
                <div>
                  <InfoRow label="Price Band" value={`₹${ipo.priceBand.min} - ₹${ipo.priceBand.max}`} />
                  <InfoRow label="Face Value" value={`₹${ipo.faceValue}`} />
                  <InfoRow label="Lot Size" value={ipo.lotSize ? formatNumber(ipo.lotSize) : "માહિતી ઉપલબ્ધ નથી"} />
                  <InfoRow label="Minimum Application" value={ipo.minimumInvestment ? `₹${formatNumber(ipo.minimumInvestment)}` : "માહિતી ઉપલબ્ધ નથી"} />
                  <InfoRow label="Issue Size" value={formatAmount(ipo.issueSize)} />
                  <InfoRow label="Issue Type" value={ipo.issueType || "માહિતી ઉપલબ્ધ નથી"} />
                  <InfoRow label="Fresh Issue" value={ipo.freshIssue.amount ? formatAmount(ipo.freshIssue.amount) : "માહિતી ઉપલબ્ધ નથી"} />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Q2 - Business */}
        <TabsContent value="q2">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Q2 - કંપની શું કરે છે?</CardTitle>
            </CardHeader>
            <CardContent>
              {ipo.business ? (
                <div className="space-y-4">
                  <div>
                    <h4 className="font-semibold text-slate-900 mb-2">વ્યાપાર વર્ણન</h4>
                    <p className="text-sm text-slate-700 leading-relaxed">{ipo.business.description}</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <h4 className="font-semibold text-slate-900 mb-2">ઉદ્યોગ</h4>
                      <p className="text-sm text-slate-700">{ipo.business.industry}</p>
                    </div>
                    <div>
                      <h4 className="font-semibold text-slate-900 mb-2">ક્ષેત્ર</h4>
                      <p className="text-sm text-slate-700">{ipo.business.sector}</p>
                    </div>
                    <div>
                      <h4 className="font-semibold text-slate-900 mb-2">ઉત્પાદનો</h4>
                      <div className="flex flex-wrap gap-2">
                        {ipo.business.products.map((product) => (
                          <Badge key={product} variant="secondary">{product}</Badge>
                        ))}
                      </div>
                    </div>
                    <div>
                      <h4 className="font-semibold text-slate-900 mb-2">સેવાઓ</h4>
                      <div className="flex flex-wrap gap-2">
                        {ipo.business.services.map((service) => (
                          <Badge key={service} variant="secondary">{service}</Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="text-xs text-slate-500">
                    સ્રોત: {ipo.business.source}
                  </div>
                </div>
              ) : (
                <InfoUnavailable />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Q3 - Customers */}
        <TabsContent value="q3">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Q3 - કંપનીના મુખ્ય Customers અને Markets કયા છે?</CardTitle>
            </CardHeader>
            <CardContent>
              {ipo.customers ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <h4 className="font-semibold text-slate-900 mb-2">ગ્રાહક શ્રેણીઓ</h4>
                      <div className="flex flex-wrap gap-2">
                        {ipo.customers.categories.map((cat) => (
                          <Badge key={cat} variant="secondary">{cat}</Badge>
                        ))}
                      </div>
                    </div>
                    <div>
                      <h4 className="font-semibold text-slate-900 mb-2">ઉદ્યોગો</h4>
                      <div className="flex flex-wrap gap-2">
                        {ipo.customers.industriesServed.map((ind) => (
                          <Badge key={ind} variant="secondary">{ind}</Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-900 mb-2">ભૌગોલિક હાજરી</h4>
                    <div className="flex flex-wrap gap-2">
                      {ipo.customers.geographicPresence.map((geo) => (
                        <Badge key={geo} variant="outline">{geo}</Badge>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-900 mb-2">દેશો</h4>
                    <div className="flex flex-wrap gap-2">
                      {ipo.customers.countries.map((country) => (
                        <Badge key={country} variant="outline">{country}</Badge>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-900 mb-2">ગ્રાહક એકાગ્રતા</h4>
                    <p className="text-sm text-slate-700">{ipo.customers.customerConcentration}</p>
                  </div>
                  <div className="text-xs text-slate-500">
                    સ્રોત: {ipo.customers.source}
                  </div>
                </div>
              ) : (
                <InfoUnavailable />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Q4 - Revenue */}
        <TabsContent value="q4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Q4 - Companyની Revenue ક્યાંથી આવે છે?</CardTitle>
            </CardHeader>
            <CardContent>
              {ipo.revenueSources ? (
                <div className="space-y-4">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-200">
                          <th className="text-left py-2 px-4">સેગમેન્ટ</th>
                          <th className="text-right py-2 px-4">રકમ</th>
                          <th className="text-right py-2 px-4">ટકાવારી</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ipo.revenueSources.sources.map((source) => (
                          <tr key={source.segment} className="border-b border-slate-100">
                            <td className="py-2 px-4">{source.segment}</td>
                            <td className="text-right py-2 px-4">{formatAmount(source.amount)}</td>
                            <td className="text-right py-2 px-4">{source.percentage}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-slate-50 p-4 rounded-lg">
                      <div className="text-sm text-slate-600">ડોમેસ્ટિક</div>
                      <div className="text-lg font-bold text-slate-900">{ipo.revenueSources.domesticPercent}%</div>
                    </div>
                    <div className="bg-slate-50 p-4 rounded-lg">
                      <div className="text-sm text-slate-600">એક્સપોર્ટ</div>
                      <div className="text-lg font-bold text-slate-900">{ipo.revenueSources.exportPercent}%</div>
                    </div>
                  </div>
                  <div className="text-xs text-slate-500">
                    સ્રોત: {ipo.revenueSources.source}
                  </div>
                </div>
              ) : (
                <InfoUnavailable />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Q5 - Financials */}
        <TabsContent value="q5">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Q5 - Companyના Financials કેવા છે?</CardTitle>
            </CardHeader>
            <CardContent>
              {ipo.financials ? (
                <div className="space-y-4">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-200">
                          <th className="text-left py-2 px-4">નાણાકીય વર્ષ</th>
                          <th className="text-right py-2 px-4">રેવન્યુ</th>
                          <th className="text-right py-2 px-4">નફો/PAT</th>
                          <th className="text-right py-2 px-4">EPS</th>
                          <th className="text-right py-2 px-4">EBITDA</th>
                          <th className="text-right py-2 px-4">ROE</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ipo.financials.years.map((year) => (
                          <tr key={year.year} className="border-b border-slate-100">
                            <td className="py-2 px-4 font-medium">{year.year}</td>
                            <td className="text-right py-2 px-4">{formatAmount(year.revenue)}</td>
                            <td className="text-right py-2 px-4">{formatAmount(year.profit)}</td>
                            <td className="text-right py-2 px-4">₹{year.eps}</td>
                            <td className="text-right py-2 px-4">{formatAmount(year.ebitda)}</td>
                            <td className="text-right py-2 px-4">{year.roe}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="text-xs text-slate-500">
                    સ્રોત: {ipo.financials.source}
                  </div>
                </div>
              ) : (
                <InfoUnavailable />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Q6 - IPO Size and Shares */}
        <TabsContent value="q6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Q6 - IPOમાં કેટલા પૈસા અને કેટલા shares છે?</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <InfoRow label="Price Band" value={`₹${ipo.priceBand.min} - ₹${ipo.priceBand.max}`} />
                  <InfoRow label="Face Value" value={`₹${ipo.faceValue}`} />
                  <InfoRow label="Lot Size" value={ipo.lotSize ? formatNumber(ipo.lotSize) : "માહિતી ઉપલબ્ધ નથી"} />
                  <InfoRow label="Minimum Investment" value={ipo.minimumInvestment ? `₹${formatNumber(ipo.minimumInvestment)}` : "માહિતી ઉપલબ્ધ નથી"} />
                  <InfoRow label="Total Issue Size" value={formatAmount(ipo.issueSize)} />
                </div>
                <div>
                  <InfoRow label="Fresh Issue Amount" value={ipo.freshIssue.amount ? formatAmount(ipo.freshIssue.amount) : "માહિતી ઉપલબ્ધ નથી"} />
                  <InfoRow label="Fresh Issue Shares" value={ipo.freshIssue.shares ? formatNumber(ipo.freshIssue.shares) : "માહિતી ઉપલબ્ધ નથી"} />
                  <InfoRow label="OFS Amount" value={ipo.offerForSale.amount ? formatAmount(ipo.offerForSale.amount) : "માહિતી ઉપલબ્ધ નથી"} />
                  <InfoRow label="OFS Shares" value={ipo.offerForSale.shares ? formatNumber(ipo.offerForSale.shares) : "માહિતી ઉપલબ્ધ નથી"} />
                  <InfoRow label="Total Shares Offered" value={ipo.totalSharesOffered ? formatNumber(ipo.totalSharesOffered) : "માહિતી ઉપલબ્ધ નથી"} />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Q7 - Use of Money and Risks */}
        <TabsContent value="q7">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Q7 - IPOમાંથી મળેલા પૈસાનો ઉપયોગ ક્યાં થશે અને મુખ્ય Risks શું છે?</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div>
                  <h4 className="font-semibold text-slate-900 mb-3">IPO ના પૈસાનો ઉપયોગ</h4>
                  {ipo.objects ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-200">
                            <th className="text-left py-2 px-4">હેતુ</th>
                            <th className="text-right py-2 px-4">રકમ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ipo.objects.objects.map((obj) => (
                            <tr key={obj.purpose} className="border-b border-slate-100">
                              <td className="py-2 px-4">{obj.purpose}</td>
                              <td className="text-right py-2 px-4">{formatAmount(obj.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <InfoUnavailable />
                  )}
                </div>
                <div>
                  <h4 className="font-semibold text-slate-900 mb-3">મુખ્ય જોખમો</h4>
                  {ipo.risks ? (
                    <div className="space-y-2">
                      {ipo.risks.risks.map((risk) => (
                        <div key={risk.risk} className="flex items-start gap-2 p-3 bg-amber-50 rounded-lg">
                          <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" />
                          <div>
                            <div className="text-sm font-medium text-slate-900">{risk.risk}</div>
                            <div className="text-xs text-slate-500">{risk.category}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <InfoUnavailable />
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Q8 - GMP */}
        <TabsContent value="q8">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Q8 - GMP અને Expected Listing Indicators શું કહે છે?</CardTitle>
            </CardHeader>
            <CardContent>
              {ipo.gmp ? (
                <div className="space-y-4">
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Shield className="h-4 w-4 text-amber-600" />
                      <span className="text-sm font-medium text-amber-800">GMP grey-market માહિતી છે; લિસ્ટિંગ ભાવની ખાતરી નથી.</span>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <div className="text-sm text-slate-600">Median GMP</div>
                        <div className="text-2xl font-bold text-slate-900">₹{ipo.gmp.median}</div>
                      </div>
                      <div>
                        <div className="text-sm text-slate-600">GMP %</div>
                        <div className="text-2xl font-bold text-slate-900">{ipo.gmp.medianPercent}%</div>
                      </div>
                      <div>
                        <div className="text-sm text-slate-600">Expected Listing</div>
                        <div className="text-2xl font-bold text-slate-900">₹{ipo.priceBand.max + ipo.gmp.median}</div>
                      </div>
                    </div>
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-900 mb-3">GMP સ્રોતો</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-200">
                            <th className="text-left py-2 px-4">સ્રોત</th>
                            <th className="text-right py-2 px-4">GMP</th>
                            <th className="text-right py-2 px-4">GMP %</th>
                            <th className="text-right py-2 px-4">તારીખ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ipo.gmp.sources.map((source) => (
                            <tr key={source.source} className="border-b border-slate-100">
                              <td className="py-2 px-4">{source.source}</td>
                              <td className="text-right py-2 px-4">₹{source.gmp}</td>
                              <td className="text-right py-2 px-4">{source.gmpPercent}%</td>
                              <td className="text-right py-2 px-4">{formatDate(source.asOf)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ) : (
                <InfoUnavailable />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Q9 - Registrar and Lead Managers */}
        <TabsContent value="q9">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Q9 - IPOના Registrar, Lead Managers અને Sponsor Bank કોણ છે?</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-semibold text-slate-900 mb-3">Registrar</h4>
                  {ipo.registrar ? (
                    <div className="space-y-2">
                      <InfoRow label="નામ" value={ipo.registrar.name} />
                      <InfoRow label="ઈમેલ" value={ipo.registrar.email} />
                      <InfoRow label="ફોન" value={ipo.registrar.phone} />
                    </div>
                  ) : (
                    <InfoUnavailable />
                  )}
                </div>
                <div>
                  <h4 className="font-semibold text-slate-900 mb-3">Lead Managers</h4>
                  {ipo.leadManagers ? (
                    <div className="space-y-2">
                      {ipo.leadManagers.names.map((name) => (
                        <div key={name} className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg">
                          <Building2 className="h-4 w-4 text-slate-500" />
                          <span className="text-sm text-slate-700">{name}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <InfoUnavailable />
                  )}
                </div>
                <div>
                  <h4 className="font-semibold text-slate-900 mb-3">Sponsor Bank</h4>
                  {ipo.sponsorBank ? (
                    <div className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg">
                      <IndianRupee className="h-4 w-4 text-slate-500" />
                      <span className="text-sm text-slate-700">{ipo.sponsorBank.name}</span>
                    </div>
                  ) : (
                    <InfoUnavailable />
                  )}
                </div>
                <div>
                  <h4 className="font-semibold text-slate-900 mb-3">દસ્તાવેજો</h4>
                  {ipo.documents && ipo.documents.length > 0 ? (
                    <div className="space-y-2">
                      {ipo.documents.map((doc) => (
                        <a
                          key={doc.type}
                          href={doc.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
                        >
                          <FileText className="h-4 w-4 text-slate-500" />
                          <span className="text-sm text-slate-700">{doc.label}</span>
                          <ExternalLink className="h-3 w-3 text-slate-400 ml-auto" />
                        </a>
                      ))}
                    </div>
                  ) : (
                    <InfoUnavailable />
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Sources */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">સ્રોતો</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="text-sm text-slate-600">ચકાસાયેલ સ્રોતો:</div>
            <div className="flex flex-wrap gap-2">
              {ipo.verifiedSources.map((source) => (
                <Badge key={source} variant="secondary">{source}</Badge>
              ))}
            </div>
            <div className="text-sm text-slate-600 mt-4">સ્રોત URLs:</div>
            <div className="space-y-1">
              {ipo.sourceUrls.map((url) => (
                <a
                  key={url}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
                >
                  <ExternalLink className="h-3 w-3" />
                  {url}
                </a>
              ))}
            </div>
            <div className="text-xs text-slate-500 mt-4">
              ચકાસણી: {formatDate(ipo.verifiedAt)} • સ્રોત: {ipo.verifiedSources.join(", ")}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}