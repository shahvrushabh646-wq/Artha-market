import type { ReactNode } from "react";
import { Panel } from "@/components/widgets";
import { cn } from "@/lib/utils";
import {
  formatGmp,
  formatMinApplication,
  formatSubscriptionAmount,
  formatSubscriptionMultiple,
  type FormattedField,
} from "@/lib/utils/ipo-formatters";

export interface IpoCardData {
  id: string;
  name: string;
  type: "Mainboard" | "SME" | "MAINBOARD" | "SME";
  status: "OPEN" | "UPCOMING" | "CLOSED";
  closeDate?: string | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  lotSize?: number | null;
  verifiedMinApplication?: number | null;
  subscription?: number | null;
  subscriptionAmountCr?: number | null;
  gmpRs?: number | null;
  gmpPct?: number | null;
}

interface IpoCardProps {
  data: IpoCardData;
  onSelect?: (id: string) => void;
  isSelected?: boolean;
}

const statusLabel: Record<IpoCardData["status"], string> = {
  OPEN: "ખુલ્લું",
  UPCOMING: "આગામી",
  CLOSED: "બંધ",
};

function typeLabel(type: IpoCardData["type"]) {
  return type === "SME" ? "એસએમઈ" : "મેઇનબોર્ડ";
}

function renderFieldValue(field: FormattedField): ReactNode {
  return (
    <span
      className={cn(
        "font-medium tabular",
        field.isAvailable ? "text-fg" : "text-muted italic"
      )}
    >
      {field.text}
    </span>
  );
}

export function IpoCard({ data, onSelect, isSelected }: IpoCardProps) {
  const minApp = formatMinApplication(
    data.verifiedMinApplication,
    data.maxPrice,
    data.lotSize
  );
  const subMultiple = formatSubscriptionMultiple(data.subscription);
  const subAmount = formatSubscriptionAmount(data.subscriptionAmountCr);
  const gmp = formatGmp(data.gmpRs, data.gmpPct);

  return (
    <button
      type="button"
      onClick={() => onSelect?.(data.id)}
      className="block w-full text-left"
      aria-label={`${data.name} IPO`}
    >
      <Panel
        className={cn(
          "p-4 transition-shadow hover:shadow-md",
          isSelected && "ring-2 ring-accent"
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate font-medium text-fg">{data.name}</div>
            {data.closeDate && (
              <div className="mt-1 text-xs text-muted">
                બંધ તારીખ: {data.closeDate}
              </div>
            )}
          </div>

          <div className="flex shrink-0 flex-col items-end gap-1">
            <span
              className={cn(
                "rounded-full px-2 py-1 text-[10px] font-semibold uppercase",
                data.status === "OPEN"
                  ? "bg-up/15 text-up"
                  : data.status === "UPCOMING"
                    ? "bg-accent/15 text-accent"
                    : "bg-surface-2 text-muted"
              )}
            >
              {statusLabel[data.status]}
            </span>
            <span className="rounded-full bg-accent/15 px-2 py-1 text-[10px] font-semibold text-accent">
              {typeLabel(data.type)}
            </span>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <Mini label="લઘુત્તમ અરજી" value={renderFieldValue(minApp)} />
          <Mini label="સબ્સ્ક્રિપ્શન" value={renderFieldValue(subMultiple)} />
          <Mini label="સબ્સ્ક્રિપ્શન રકમ" value={renderFieldValue(subAmount)} />
          <Mini
            label="GMP (અનૌપચારિક)"
            value={renderFieldValue(gmp)}
            green={gmp.isAvailable && (data.gmpRs ?? 0) > 0}
          />
        </div>
      </Panel>
    </button>
  );
}

function Mini({
  label,
  value,
  green,
}: {
  label: string;
  value: ReactNode;
  green?: boolean;
}) {
  return (
    <div className="rounded-lg bg-surface-2 p-2.5">
      <div className="text-[10px] uppercase tracking-wide text-subtle">{label}</div>
      <div className={cn("mt-1 truncate text-sm", green && "text-up")}>{value}</div>
    </div>
  );
}
