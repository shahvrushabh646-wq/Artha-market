import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Panel } from "@/components/widgets";
import { cn } from "@/lib/utils";

type Language = "en" | "gu";

type FaqItem = {
  id: string;
  category: string;
  question: Record<Language, string>;
  answer: Record<Language, string>;
};

const FAQS: FaqItem[] = [
  {
    id: "ipo-basics",
    category: "BASICS",
    question: {
      en: "What is an IPO and why do companies launch one?",
      gu: "IPO એટલે શું અને કંપની શા માટે લાવે છે?"
    },
    answer: {
      en: "An Initial Public Offering (IPO) is the process through which a company offers shares to public investors and seeks listing on a stock exchange such as NSE or BSE. Companies may raise capital for business purposes such as expansion, debt repayment or other stated objects of the issue.",
      gu: "IPO (Initial Public Offering) એ એવી પ્રક્રિયા છે જેમાં કંપની પ્રથમ વખત જાહેર રોકાણકારોને શેર ઓફર કરે છે અને NSE અથવા BSE જેવા સ્ટોક એક્સચેન્જ પર લિસ્ટિંગ મેળવવાનો પ્રયાસ કરે છે. ઇશ્યૂમાંથી મળેલા નાણાંનો ઉપયોગ પ્રોસ્પેક્ટસમાં જણાવેલા હેતુઓ મુજબ થાય છે."
    }
  },
  {
    id: "cutoff",
    category: "BIDDING",
    question: {
      en: "What does Cut-off Price mean?",
      gu: "Cut-off Price એટલે શું?"
    },
    answer: {
      en: "For eligible retail investors in a book-built IPO, choosing Cut-off means you agree to pay the final issue price discovered within the price band. It can help avoid rejection caused by bidding below the final issue price, but it does not guarantee allotment.",
      gu: "બુક-બિલ્ટ IPOમાં પાત્ર રિટેલ રોકાણકાર Cut-off પસંદ કરે ત્યારે તે પ્રાઇસ બેન્ડની અંદર નક્કી થનારી અંતિમ ઇશ્યૂ કિંમત સ્વીકારી રહ્યો છે. આ અંતિમ કિંમત કરતાં ઓછી bid થવાને કારણે અરજી રિજેક્ટ થવાનું ટાળવામાં મદદ કરી શકે છે, પરંતુ allotmentની ગેરંટી આપતું નથી."
    }
  },
  {
    id: "gmp",
    category: "GMP",
    question: {
      en: "What is Grey Market Premium (GMP)?",
      gu: "GMP (ગ્રે માર્કેટ પ્રીમિયમ) શું છે?"
    },
    answer: {
      en: "GMP is an unofficial market indicator for an IPO before listing. It is not an exchange-verified price and is not a guarantee of the listing price. GMP can change quickly and may differ between sources.",
      gu: "GMP IPO લિસ્ટ થાય તે પહેલાંનો અનૌપચારિક માર્કેટ ઇન્ડિકેટર છે. તે સ્ટોક એક્સચેન્જ દ્વારા ચકાસાયેલ ભાવ નથી અને લિસ્ટિંગ ભાવની ગેરંટી આપતો નથી. GMP ઝડપથી બદલાઈ શકે છે અને અલગ-અલગ સ્રોતોમાં અલગ હોઈ શકે છે."
    }
  },
  {
    id: "gmp-percent",
    category: "GMP",
    question: {
      en: "How is GMP percentage calculated?",
      gu: "GMP ટકાવારી કેવી રીતે ગણાય છે?"
    },
    answer: {
      en: "Artha calculates GMP percentage as: GMP ÷ upper price-band price × 100. For example, if the upper price is ₹400 and GMP is ₹40, GMP is 10%.",
      gu: "Arthaમાં GMP ટકાવારી આ રીતે ગણાય છે: GMP ÷ પ્રાઇસ બેન્ડની ઉપરની કિંમત × 100. ઉદાહરણ તરીકે, ઉપરની કિંમત ₹400 અને GMP ₹40 હોય તો GMP 10% થાય."
    }
  },
  {
    id: "pan",
    category: "RULES",
    question: {
      en: "Can I submit multiple IPO applications using the same PAN?",
      gu: "શું એક જ PANથી એક IPO માટે ઘણી અરજીઓ કરી શકાય?"
    },
    answer: {
      en: "For an IPO, submitting multiple applications/bids using the same PAN can lead to rejection as duplicate applications. Use the permitted application route and investor category applicable to you.",
      gu: "એક જ IPO માટે એક જ PANથી ઘણી duplicate applications/bids કરવાથી અરજીઓ રિજેક્ટ થઈ શકે છે. તમારી પાત્રતા મુજબ માન્ય application route અને investor categoryનો ઉપયોગ કરો."
    }
  },
  {
    id: "allotment",
    category: "ALLOTMENT",
    question: {
      en: "Does high subscription or high GMP guarantee allotment or listing gains?",
      gu: "વધુ subscription અથવા GMPથી allotment કે listing gainની ગેરંટી મળે છે?"
    },
    answer: {
      en: "No. Subscription levels and GMP are indicators, not guarantees. Allotment depends on the applicable category, demand and the issue's allotment process. GMP is unofficial and can change before listing.",
      gu: "ના. Subscription અને GMP માત્ર indicators છે, ગેરંટી નથી. Allotment સંબંધિત category, demand અને IPOની allotment પ્રક્રિયા પર આધારિત હોય છે. GMP અનૌપચારિક છે અને listing પહેલાં બદલાઈ શકે છે."
    }
  }
];

export function IpoFaqAccordion() {
  const [lang, setLang] = useState<Language>("gu");
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    setOpenId(null);
  }, [lang]);

  return (
    <section className="mt-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-display text-xl tracking-tight">
          {lang === "gu" ? "IPO પ્રશ્નો અને માર્ગદર્શન" : "IPO FAQs & Guide"}
        </h2>
        <div className="inline-flex shrink-0 overflow-hidden rounded-lg bg-surface-2 p-0.5">
          <button type="button" onClick={() => setLang("gu")} className={cn("rounded-md px-2.5 py-1.5 text-[11px]", lang === "gu" ? "bg-accent text-white" : "text-muted")}>ગુજરાતી</button>
          <button type="button" onClick={() => setLang("en")} className={cn("rounded-md px-2.5 py-1.5 text-[11px]", lang === "en" ? "bg-accent text-white" : "text-muted")}>English</button>
        </div>
      </div>
      <Panel className="p-4">
        {FAQS.map((faq) => {
          const open = openId === faq.id;
          return (
            <div key={faq.id} className="border-b border-border last:border-b-0">
              <button
                type="button"
                onClick={() => setOpenId(open ? null : faq.id)}
                className="flex w-full items-center justify-between gap-3 py-4 text-left"
                aria-expanded={open}
              >
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-subtle">{faq.category}</div>
                  <div className="mt-1 text-sm font-medium text-fg">{faq.question[lang]}</div>
                </div>
                <ChevronDown className={cn("size-4 shrink-0 text-muted transition-transform", open && "rotate-180")} />
              </button>
              {open && <div className="pb-4 pr-7 text-sm leading-6 text-muted">{faq.answer[lang]}</div>}
            </div>
          );
        })}
      </Panel>
    </section>
  );
}
