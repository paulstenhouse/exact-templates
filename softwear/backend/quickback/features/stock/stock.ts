/**
 * What is left of each size of each style. Colours share a size's stock.
 * Anyone may read it; staff restock it; an order takes from it (orders/actions/checkout.ts).
 */
import { feature, q } from "@quickback/compiler";

export default feature("stock", {
    columns: {
        id: q.id(),
        productSlug: q.text().required().filterable("eq", "in"),
        size: q.text().required(),
        // The database refuses a negative count, whatever code asks for it.
        count: q.int().required().check(">= 0"),
        ...q.audit(),
        ...q.softDelete(),
    },
    unique: [{ columns: ["productSlug", "size"] }],

    firewall: { softDelete: {} },
    guards: {
        createable: ["productSlug", "size", "count"],
        updatable: ["count"],
    },

    read: { access: { roles: ["PUBLIC"] }, pageSize: 100 },
    create: { access: { userRole: ["sysadmin"] } },
    update: { access: { userRole: ["sysadmin"] } },
});
