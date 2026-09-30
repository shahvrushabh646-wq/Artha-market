import { useEffect, useState } from "react";
import { IPO } from "@/types/ipo";
import { ipoService } from "@/lib/ipoData";
import { IPOList } from "@/components/ipo/IPOList";
import { IPODetail } from "@/components/ipo/IPODetail";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp } from "lucide-react";

export default function App() {
  const [ipos, setIpos] = useState<IPO[]>([]);
  const [selectedIpo, setSelectedIpo] = useState<IPO | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadIPOs = async () => {
      try {
        const data = await ipoService.getIPOs();
        setIpos(data);
        if (data.length > 0) {
          setSelectedIpo(data[0]);
        }
      } catch (error) {
        console.error("Failed to load IPOs:", error);
      } finally {
        setLoading(false);
      }
    };

    loadIPOs();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="max-w-7xl mx-auto p-6">
          <div className="flex items-center gap-2 mb-6">
            <TrendingUp className="h-6 w-6 text-blue-600" />
            <h1 className="text-2xl font-bold text-slate-900">IPO Section</h1>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <Skeleton className="h-4 w-3/4 mb-2" />
                    <Skeleton className="h-3 w-1/2" />
                  </CardContent>
                </Card>
              ))}
            </div>
            <div className="lg:col-span-2">
              <Card>
                <CardContent className="p-6">
                  <Skeleton className="h-8 w-1/2 mb-4" />
                  <Skeleton className="h-4 w-full mb-2" />
                  <Skeleton className="h-4 w-full mb-2" />
                  <Skeleton className="h-4 w-3/4" />
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto p-6">
        <div className="flex items-center gap-2 mb-6">
          <TrendingUp className="h-6 w-6 text-blue-600" />
          <h1 className="text-2xl font-bold text-slate-900">IPO Section</h1>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div>
            <IPOList
              ipos={ipos}
              onSelect={setSelectedIpo}
              selectedId={selectedIpo?.id}
            />
          </div>
          <div className="lg:col-span-2">
            {selectedIpo ? (
              <IPODetail ipo={selectedIpo} />
            ) : (
              <Card>
                <CardContent className="p-6 text-center text-slate-500">
                  કોઈ IPO પસંદ કરેલ નથી
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}