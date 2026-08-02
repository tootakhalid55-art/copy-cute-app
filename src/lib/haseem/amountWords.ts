// تحويل مبلغ رقمي إلى صياغة عربية مقروءة (ريال سعودي وهللة) — تُستخدم في السندات والفواتير المبسّطة.
export function amountToWordsArabic(amount: number) {
  const n = Math.max(0, Number(amount) || 0);
  const intPart = Math.floor(n);
  const frac = Math.round((n - intPart) * 100);
  if (intPart === 0 && frac === 0) return "صفر ريال سعودي";
  const small = [
    "صفر", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة",
    "عشرة", "أحد عشر", "اثنا عشر", "ثلاثة عشر", "أربعة عشر", "خمسة عشر", "ستة عشر", "سبعة عشر", "ثمانية عشر", "تسعة عشر",
  ];
  const tens = ["", "", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"];
  const hundreds = ["", "مائة", "مئتا", "ثلاثمائة", "أربعمائة", "خمسمائة", "ستمائة", "سبعمائة", "ثمانمائة", "تسعمائة"];
  const chunk = (x: number) => {
    const h = Math.floor(x / 100);
    const rem = x % 100;
    const out: string[] = [];
    if (h) out.push(hundreds[h]);
    if (rem) {
      if (rem < 20) out.push(small[rem]);
      else {
        const t = Math.floor(rem / 10);
        const o = rem % 10;
        out.push(o ? `${small[o]} و${tens[t]}` : tens[t]);
      }
    }
    return out.join(" و");
  };
  const thousands = Math.floor(intPart / 1000);
  const rest = intPart % 1000;
  const parts: string[] = [];
  if (thousands) parts.push(thousands === 1 ? "ألف" : thousands === 2 ? "ألفان" : thousands < 11 ? `${small[thousands]} آلاف` : `${chunk(thousands)} ألف`);
  if (rest) parts.push(chunk(rest));
  let words = parts.filter(Boolean).join(" و") || "صفر";
  words += " ريال سعودي";
  if (frac) words += ` و${chunk(frac)} هللة`;
  return words;
}
