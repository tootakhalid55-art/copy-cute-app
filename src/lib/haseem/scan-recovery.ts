export function isScanGatewayFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /\b502\b|\b503\b|\b504\b|Bad Gateway|Gateway Timeout|Service Unavailable/i.test(message);
}

export function scanFailureMessage(error: unknown): string {
  if (isScanGatewayFailure(error)) return "انقطع الاتصال بخدمة المسح مؤقتًا، ربما أثناء تحديث التطبيق. احتفظنا بالملف؛ اضغط إعادة للمحاولة مجددًا.";
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/<(?:html|head|body|!doctype)\b/i.test(message)) return "تعذر الاتصال بخدمة المسح. حاول مجددًا بعد قليل.";
  return message || "فشل المسح";
}

/** Retry only transient gateway errors; never retry invoice creation or provider billing errors. */
export async function scanWithGatewayRecovery<T>(
  scan: () => Promise<T>,
  onRetry: (attempt: number) => void,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await scan(); }
    catch (error) {
      if (!isScanGatewayFailure(error) || attempt >= 2) throw error;
      onRetry(attempt + 1);
      await wait(attempt === 0 ? 15000 : 30000);
    }
  }
}
