/** Keep logo/stamp uploads small enough for scoped browser storage. */
export async function prepareBrandingImage(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("اختر ملف صورة للشعار مثل PNG أو JPG");
  if (file.size > 20 * 1024 * 1024) throw new Error("حجم الصورة كبير؛ اختر صورة أصغر من 20 ميجابايت");
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(new Error("تعذر قراءة الصورة؛ جرّب حفظها بصيغة PNG أو JPG")); img.src = url; });
    const ratio = Math.min(1, 1000 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * ratio));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * ratio));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("تعذر تجهيز الصورة في المتصفح");
    context.drawImage(img, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL("image/png");
    if (data.length > 2 * 1024 * 1024) throw new Error("الصورة كبيرة بعد التجهيز؛ اختر شعارًا أبسط أو أقل دقة");
    return data;
  } finally { URL.revokeObjectURL(url); }
}
