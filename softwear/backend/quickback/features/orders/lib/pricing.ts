// The store's shipping rules, in one place: checkout prices with them.
export const FREE_SHIPPING_FROM = 7500;
export const STANDARD = 600;
export const EXPRESS = 1400;

export function shippingFor(method: "standard" | "express", afterDiscountCents: number): number {
    if (method === "express") return EXPRESS;
    return afterDiscountCents >= FREE_SHIPPING_FROM ? 0 : STANDARD;
}

// SW-104233: six digits from the platform's random source. `orders.number` is unique, so a
// collision fails the insert and checkout draws again.
export function orderNumber(): string {
    const n = crypto.getRandomValues(new Uint32Array(1))[0]! % 900000;
    return `SW-${100000 + n}`;
}
