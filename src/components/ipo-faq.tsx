import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Panel } from "@/components/widgets";
import { cn } from "@/lib/utils";

type Language = "en" | "gu";

export interface CompanyFaqProps {
  companyName: string;
  metadata: {
    description?: string;
    objectsOfIssue?: string[];
    issueStructure?: string;
    promoters?: string[];
    segments?: string[];
    competitors?: string[];
    risks?: string[];
  };
}

export function IpoCompanyFaqSection({ companyName, metadata }: CompanyFaqProps) {
  const [lang, setLang] = useState<Language>("gu");
  const [openId, setOpenId] = useState<string | null>(null);
  const notAvailable = lang === "gu"
    ? "હાલના પ્રોસ્પેક્ટસમાં માહિતી ઉપલબ્ધ નથી."
    : "Data unavailable in current prospectus.";

  useEffect(() => setOpenId(null), [lang, companyName]);

  const faqs = [
    { id: "faq-1", en: `What does ${companyName} do?`, gu: `${companyName} નો મુખ્ય બિઝનેસ શું છે?`, answer: metadata.description },
    { id: "faq-2", en: "Why is the company raising money?", gu: "કંપની IPO દ્વારા ભંડોળ શા માટે એકત્ર કરી રહી છે?", answer: metadata.objectsOfIssue?.join(", ") },
    { id: "faq-3", en: "What is the breakdown of Fresh Issue vs OFS?", gu: "આ IPO માં ફ્રેશ ઇશ્યૂ અને OFS (Offer for Sale) ની વિગતો શું છે?", answer: metadata.issueStructure },
    { id: "faq-4", en: "Who are the promoters of the company?", gu: "કંપનીના પ્રમોટર્સ કોણ છે?", answer: metadata.promoters?.join(", ") },
    { id: "faq-5", en: "What are the main business segments?", gu: "કંપનીના મુખ્ય બિઝનેસ સેગમેન્ટ્સ કયા છે?", answer: metadata.segments?.join(", ") },
    { id: "faq-6", en: "Who are the main competitors?", gu: "માર્કેટમાં કંપનીના મુખ્ય હરીફો કોણ છે?", answer: metadata.competitors?.join(", ") },
    { id: "faq-7", en: "What are the key risks of investing in this IPO?", gu: "આ કંપનીના IPO માં રોકાણ કરવાના મુખ્ય જોખમો કયા છે?", answer: metadata.risks?.map(r => `• ${r}`).join("\n") }
  ];

  return (
    <section className="mt-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-display text-xl tracking-tight">
          {lang === "gu" ? `${companyName} વિશે માહિતી (FAQ)` : `${companyName} Company Research`}
        </h2>
        <div className="inline-flex shrink-0 overflow-hidden rounded-lg bg-surface-2 p-0.5">
          <button type="button" onClick={() => setLang("gu")} className={cn("rounded-md px-2.5 py-1.5 text-[11px]", lang === "gu" ? "bg-accent text-white" : "text-muted")}>ગુજરાતી</button>
          <button type="button" onClick={() => setLang("en")} className={cn("rounded-md px-2.5 py-1.5 text-[11px]", lang === "en" ? "bg-accent text-white" : "text-muted")}>English</button>
        </div>
      </div>
      <Panel className="p-4">
        {faqs.map(item => {
          const open = openId === item.id;
          return (
            <div key={item.id} className="border-b border-border last:border-b-0">
              <button type="button" onClick={() => setOpenId(open ? null : item.id)} className="flex w-full items-center justify-between gap-3 py-4 text-left" aria-expanded={open}>
                <div className="text-sm font-medium text-fg">{lang === "gu" ? item.gu : item.en}</div>
                <ChevronDown className={cn("size-4 shrink-0 text-muted transition-transform", open && "rotate-180")} />
              </button>
              {open && <div className="whitespace-pre-wrap pb-4 pr-7 text-sm leading-6 text-muted">{item.answer || notAvailable}</div>}
            </div>
          );
        })}
      </Panel>
    </section>
  );
}

// Backward-compatible export for deployments built from the immediately previous route commit.
// The current route uses IpoCompanyFaqSection and does not render this legacy component.
export function IpoFaqAccordion() { return null; }
