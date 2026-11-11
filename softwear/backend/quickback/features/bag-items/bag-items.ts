/**
 * A shopper's bag, one row per style, colour and size. The Exact app keeps the bag on the
 * device too, and sends it here whenever it changes (actions/sync.ts), so it follows the
 * shopper to their next device and is what checkout reads.
 */
import { feature, q } from "@quickback/compiler";

export default feature("bagItems", {
    columns: {
        id: q.id(),
        // FIREWALL: every query on this table gets WHERE owner_id = <the caller>.
        ownerId: q.scope("owner"),
        productSlug: q.text().required(),
        color: q.text().required(),
        size: q.text().required(),
        qty: q.int().required().check("BETWEEN 1 AND 10"),
        ...q.audit(),
    },
    unique: [{ columns: ["ownerId", "productSlug", "color", "size"] }],

    // Declared, not left to q.scope("owner"): the compiler does not count the auto-derived
    // owner scope when it checks that a USER resource is scoped to its owner.
    firewall: [{ field: "ownerId", equals: "ctx.userId" }],

    guards: {
        createable: ["productSlug", "color", "size", "qty"],
        updatable: ["qty"],
    },

    read: { access: { roles: ["USER"] }, pageSize: 100 },
    create: { access: { roles: ["USER"] } },
    update: { access: { roles: ["USER"] } },
    delete: { access: { roles: ["USER"] }, mode: "hard" },
});
