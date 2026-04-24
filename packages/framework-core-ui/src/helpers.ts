/** Merges a default class name with an optional consumer class name. */
export function mergeClassNames(base: string, extra?: string): string | undefined {
  return [base, extra].filter(Boolean).join(" ") || undefined;
}
