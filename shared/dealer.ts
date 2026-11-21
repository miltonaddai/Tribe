/**
 * What the car lot sells. Shared so the server can validate a purchase price
 * rather than trusting whatever the client claims a car costs.
 */
export type CarSpec = { kind: string; name: string; color: string; price: number };

/** Priced in Block Bucks. See CATALOG in items.ts. */
export const DEALER_STOCK: CarSpec[] = [
  { kind: "hatch", name: "Hatch", color: "#E5E7EB", price: 5000 },
  { kind: "sedan", name: "Sedan", color: "#3B82F6", price: 10000 },
  { kind: "suv", name: "SUV", color: "#166534", price: 18000 },
  { kind: "sport", name: "Sport", color: "#FFB830", price: 35000 },
];

export function carSpec(kind: string): CarSpec | null {
  return DEALER_STOCK.find((c) => c.kind === kind) ?? null;
}
