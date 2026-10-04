import type { ScanResult } from "./scan.functions";

export type RegisteredScanSupplier = {
  id: string; name?: string; taxNumber?: string; cr_number?: string;
  address?: string; phone?: string; email?: string;
  street?: string; district?: string; city?: string; region?: string;
  buildingNo?: string; postalCode?: string;
};

export function applyRegisteredSupplier<T extends ScanResult>(invoice: T, supplier: RegisteredScanSupplier): T {
  return { ...invoice,
    supplierName: supplier.name ?? "",
    supplierVatNumber: supplier.taxNumber ?? "",
    supplierCrNumber: supplier.cr_number ?? "",
    supplierAddress: supplier.address || [supplier.buildingNo, supplier.street, supplier.district, supplier.city, supplier.region, supplier.postalCode].filter(Boolean).join("، "),
    supplierPhone: supplier.phone ?? "",
    supplierEmail: supplier.email ?? "",
  };
}

export function resolveScanSupplier<T extends RegisteredScanSupplier>(suppliers: T[], selectedId: string | undefined, name: string): T | undefined {
  if (selectedId) {
    const supplier = suppliers.find(s => s.id === selectedId);
    if (!supplier) throw new Error("المورد المختار لم يعد متاحًا؛ أعد اختياره قبل الحفظ");
    return supplier;
  }
  const matches = suppliers.filter(s => s.name?.trim() === name.trim());
  if (matches.length > 1) throw new Error("يوجد أكثر من مورد بالاسم نفسه؛ اختر المورد من القائمة");
  return matches[0];
}
