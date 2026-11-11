/**
 * The lines of an order: what was bought, at the price it was bought at.
 * Written only by checkout; read by the order's owner.
 */
import { feature, q } from "@quickback/compiler";

export default feature("orderLines", {
    columns: {
        id: q.id(),
        ownerId: q.scope("owner"),
        orderNumber: q.text().required().filterable("eq", "in"),
        productSlug: q.text().required(),
        name: q.text().required(),
        color: q.text().required(),
        size: q.text().required(),
        qty: q.int().required().check("> 0"),
        priceCents: q.int().required(),
        ...q.audit(),
        ...q.softDelete(),
    },

    // Declared, not left to q.scope("owner"): the compiler does not count the auto-derived
    // owner scope when it checks that a USER resource is scoped to its owner.
    firewall: [{ field: "ownerId", equals: "ctx.userId" }, { field: "deletedAt", isNull: true }],

    guards: { createable: [], updatable: [] },

    read: { access: { or: [{ roles: ["USER"] }, { roles: ["SYSADMIN"] }] }, pageSize: 100 },
});
