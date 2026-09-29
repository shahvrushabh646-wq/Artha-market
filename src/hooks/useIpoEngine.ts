import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  fetchIpoDetailFast,
  fetchIpoDetailLive,
  fetchOpenIposLive,
} from "@/lib/market/ipo-live";

export function useIpoEngine(requestedId?: string) {
  const universeQuery = useQuery({
    queryKey: ["open-ipos-live", "nse-official-v4"],
    queryFn: () => fetchOpenIposLive(),
    refetchInterval: 60000,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const selectedId = useMemo(() => {
    const universe = universeQuery.data ?? [];
    if (requestedId) {
      return requestedId;
    }
    return universe[0]?.id;
  }, [requestedId, universeQuery.data]);

  const fastDetailQuery = useQuery({
    queryKey: ["ipo-detail-fast", selectedId, universeQuery.dataUpdatedAt],
    queryFn: () => fetchIpoDetailFast({ data: { id: selectedId! } }),
    enabled: !!selectedId,
    staleTime: 30000,
  });

  const enrichedDetailQuery = useQuery({
    queryKey: ["ipo-detail-enriched", selectedId, universeQuery.dataUpdatedAt],
    queryFn: () => fetchIpoDetailLive({ data: { id: selectedId! } }),
    enabled: !!selectedId && !!fastDetailQuery.data,
    staleTime: 30000,
  });

  const selectedIpo = enrichedDetailQuery.data ?? fastDetailQuery.data ??
    universeQuery.data?.find((ipo) => ipo.id === selectedId) ?? null;

  return {
    universe: universeQuery.data ?? [],
    selectedId,
    selectedIpo,
    isLoading: universeQuery.isLoading,
    isDetailLoading: fastDetailQuery.isLoading || enrichedDetailQuery.isFetching,
    refresh: async () => {
      await universeQuery.refetch();
    },
    refreshDetail: async () => {
      await enrichedDetailQuery.refetch();
    },
  };
}
