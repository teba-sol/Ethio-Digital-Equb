export function formatMoney(santim: number): string {
  if (!Number.isInteger(santim)) {
    throw new Error(
      `formatMoney expects an integer number of santim, got ${santim}`,
    );
  }
  const sign = santim < 0 ? "-" : "";
  const abs = Math.abs(santim);
  const birr = Math.floor(abs / 100);
  const raw = abs % 100;
  return `${sign}${birr.toLocaleString("en-US")}.${String(raw).padStart(2, "0")} ETB`;
}

export function parseMoney(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const [birrPart, santimPart] = trimmed.split(".");
  const santim = santimPart ? Number(santimPart.padEnd(2, "0")) : 0;
  const birr = Number(birrPart);
  return birr * 100 + santim;
}
