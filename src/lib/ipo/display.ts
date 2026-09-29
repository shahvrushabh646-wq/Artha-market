import { FETCHING, UNAVAILABLE } from "./text"; export { FETCHING, UNAVAILABLE };
export function money(v:number|null|undefined){return v==null?UNAVAILABLE:`₹${v.toLocaleString("en-IN",{maximumFractionDigits:2})}`;}
export function crore(v:number|null|undefined){return v==null?UNAVAILABLE:`₹${v.toLocaleString("en-IN",{maximumFractionDigits:2})} કરોડ`;}
export function multiple(v:number|null|undefined){return v==null?UNAVAILABLE:`${v.toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2})} ગણું`;}
export function shares(v:number|null|undefined){return v==null?UNAVAILABLE:v.toLocaleString("en-IN");}
export function pct(v:number|null|undefined){return v==null?UNAVAILABLE:`${v.toLocaleString("en-IN",{maximumFractionDigits:2})}%`;}
export function dateGu(v:string|null|undefined){if(!v)return UNAVAILABLE;const d=new Date(`${v}T00:00:00+05:30`);return Number.isNaN(d.getTime())?v:d.toLocaleDateString("gu-IN",{day:"2-digit",month:"short",year:"numeric"});}
export function dateEn(v:string|null|undefined){if(!v)return UNAVAILABLE;const d=new Date(`${v}T00:00:00+05:30`);return Number.isNaN(d.getTime())?v:d.toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"});}
export function textOr(v:string|null|undefined,fetching=false){if(fetching&&(v==null||v===""))return FETCHING;const s=(v??"").trim();return s||UNAVAILABLE;}
export function boardGu(v:string|null|undefined){if(v==="SME")return"એસએમઈ";if(v==="Mainboard"||v==="MAINBOARD")return"મેઇનબોર્ડ";return v||UNAVAILABLE;}
export function statusGu(v:string){if(v==="OPEN")return"ખુલ્લું";if(v==="UPCOMING")return"આગામી";if(v==="CLOSED")return"બંધ";return v;}