/** Keep the saved address and every supplied national-address component. */
export function fullAddress(value: Record<string, unknown> | null | undefined): string {
  if (!value) return "";
  const clean = (v: unknown) => typeof v === "string" || typeof v === "number" ? String(v).trim() : "";
  const address = typeof value.address === "object" && value.address ? clean((value.address as {text?: unknown}).text) : clean(value.address);
  const parts = [address === "غير محدد" ? "" : address, clean(value.street), clean(value.district), clean(value.city), clean(value.region), clean(value.country)];
  for (const [key, label] of [["buildingNo", "رقم المبنى"], ["postalCode", "الرمز البريدي"], ["additionalNo", "الرقم الإضافي"]]) {
    const text = clean(value[key]);
    if (text) parts.push(label + ": " + text);
  }
  return [...new Set(parts.filter(Boolean))].join("، ");
}
