/**
 * Faz parse de string de data nos formatos brasileiros e ISO.
 * Aceita: dd/mm/yyyy, dd-mm-yyyy, yyyy-mm-dd, dd.mm.yyyy
 * Retorna null em caso de falha — nunca lança exceção.
 */
export function parseDate(raw: string): Date | null {
  if (!raw || typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s) return null;

  let day: number, month: number, year: number;

  // ISO: yyyy-mm-dd
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    year = parseInt(isoMatch[1], 10);
    month = parseInt(isoMatch[2], 10);
    day = parseInt(isoMatch[3], 10);
  } else {
    // BR: dd/mm/yyyy ou dd-mm-yyyy ou dd.mm.yyyy
    const brMatch = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
    if (!brMatch) return null;
    day = parseInt(brMatch[1], 10);
    month = parseInt(brMatch[2], 10);
    year = parseInt(brMatch[3], 10);
    // Ano de 2 dígitos: assume 2000+
    if (year < 100) year += 2000;
  }

  if (
    isNaN(day) || isNaN(month) || isNaN(year) ||
    month < 1 || month > 12 ||
    day < 1 || day > 31 ||
    year < 1900 || year > 2100
  ) {
    return null;
  }

  // Valida a data construindo-a e verificando se não "transbordou"
  const d = new Date(year, month - 1, day);
  if (
    d.getFullYear() !== year ||
    d.getMonth() !== month - 1 ||
    d.getDate() !== day
  ) {
    return null;
  }

  return d;
}

/**
 * Calcula diferença em dias inteiros entre duas datas, sem artefatos de DST.
 * Usa UTC midnight para ambas.
 */
export function diffInDays(a: Date, b: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const utcB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.floor((utcB - utcA) / msPerDay);
}

/**
 * Formata uma data no padrão dd/mm/yyyy (pt-BR).
 */
export function formatDateBR(d: Date): string {
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
