export function isActiveFilterValue(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "" && value !== "ALL";
}

export function countActiveFilters(values: readonly unknown[]): number {
  return values.filter(isActiveFilterValue).length;
}
