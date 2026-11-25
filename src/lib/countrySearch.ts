const LOCALES = ["fr", "en", "es", "pt", "de", "it", "nl", "ar", "ru", "zh", "ja"] as const;

export const normalizeCountrySearch = (value: string) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

const editDistance = (a: string, b: string) => {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[b.length];
};

export const countrySearchMatches = (value: string, search: string) => {
  const query = normalizeCountrySearch(search);
  if (!query) return 1;
  const haystack = normalizeCountrySearch(value);
  if (haystack.includes(query)) return 1;
  const words = haystack.split(" ").filter(Boolean);
  const queryWords = query.split(" ").filter(Boolean);
  const matches = queryWords.every((part) =>
    words.some((word) => {
      if (word.includes(part) || part.includes(word)) return true;
      if (part.length < 4 || word.length < 4) return false;
      return editDistance(word, part) <= (Math.max(word.length, part.length) >= 8 ? 2 : 1);
    })
  );
  return matches ? 1 : 0;
};

export const getLocalizedCountryNames = (code: string) => {
  const names = LOCALES.map((locale) => {
    try {
      return new Intl.DisplayNames([locale], { type: "region" }).of(code) || "";
    } catch {
      return "";
    }
  });
  return [...new Set(names)].join(" ");
};
