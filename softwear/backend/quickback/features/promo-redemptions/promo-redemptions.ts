/**
 * Which shopper used which once-only code, on which order. The unique index is what
 * makes "once" true even when two checkouts race.
 */
import { feature, q } from "@quickback/compiler";

export default feature("promoRedemptions", {
    columns: {
        id: q.id(),
        ownerId: q.scope("owner"),
        code: q.text().required(),
        orderNumber: q.text().required(),
        ...q.audit(),
        ...q.softDelete(),
    },
    unique: [{ columns: ["ownerId", "code"] }],

    // Declared, not left to q.scope("owner"): the compiler does not count the auto-derived
    // owner scope when it checks that a USER resource is scoped to its owner.
    firewall: [{ field: "ownerId", equals: "ctx.userId" }, { field: "deletedAt", isNull: true }],

    guards: { createable: [], updatable: [] },

    read: { access: { or: [{ roles: ["USER"] }, { roles: ["SYSADMIN"] }] } },
});
