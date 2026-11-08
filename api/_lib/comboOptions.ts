export const COMBO_OPTION_KINDS = ["acompanamiento", "mejora"] as const;
export type ComboOptionKind = (typeof COMBO_OPTION_KINDS)[number];

export interface ComboOptionRow {
  id: string;
  kind: ComboOptionKind;
  name: string;
  price: number;
  sort_order: number;
  is_active: boolean;
}

export function rowToComboOption(row: ComboOptionRow) {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    price: row.price,
    isActive: row.is_active,
  };
}

export function isComboOptionKind(value: unknown): value is ComboOptionKind {
  return typeof value === "string" && (COMBO_OPTION_KINDS as readonly string[]).includes(value);
}
