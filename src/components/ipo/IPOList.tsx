import { IPO } from "@/types/ipo";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TrendingUp, IndianRupee, Calendar, Users } from "lucide-react";

interface IPOListProps {
  ipos: IPO[];
  onSelect: (ipo: IPO) => void;
  selectedId?: string;
}

const formatAmount = (amount: number) => {
  if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(2)} કરોડ`;
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(2)} લાખ`;
  return `₹${amount.toLocaleString("en-IN")}`;
};

const formatDate = (dateStr: string) => {
  const date = new Date(dateStr);
  return date.toLocaleDateString("gu-IN", { day: "numeric", month: "short", year: "numeric" });
};

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

export function IPOList({ ipos, onSelect, selectedId }: IPOListProps) {
  return (
    <div className="space-y-4">
      {ipos.map((ipo) => (
        <Card
          key={ipo.id}
          className={`cursor-pointer transition-all hover:shadow-md ${
            selectedId === ipo.id ? "ring-2 ring-blue-500" : ""
          }`}
          onClick={() => onSelect(ipo)}
        >
          <CardContent className="p-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-slate-900">{ipo.companyName}</h3>
                  <Badge variant="outline">{ipo.ipoType === "SME" ? "એસએમઈ" : "મેઈનબોર્ડ"}</Badge>
                  {getStatusBadge(ipo.status)}
                </div>
                <div className="flex items-center gap-4 mt-2 text-sm text-slate-600">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {formatDate(ipo.openDate)} - {formatDate(ipo.closeDate)}
                  </span>
                  <span className="flex items-center gap-1">
                    <IndianRupee className="h-3 w-3" />
                    ₹{ipo.priceBand.min} - ₹{ipo.priceBand.max}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="text-sm text-slate-600">Issue Size</div>
                  <div className="font-semibold text-slate-900">{formatAmount(ipo.issueSize)}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-slate-600">Subscription</div>
                  <div className="font-semibold text-slate-900">{ipo.subscription.overall}x</div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-slate-600">GMP</div>
                  <div className="font-semibold text-green-600">₹{ipo.gmp.median}</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}