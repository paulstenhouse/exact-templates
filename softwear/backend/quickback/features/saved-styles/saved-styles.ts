/**
 * The styles a shopper saved (the heart on a product).
 */
import { feature, q } from "@quickback/compiler";

export default feature("savedStyles", {
    columns: {
        id: q.id(),
        ownerId: q.scope("owner"),
        productSlug: q.text().required().filterable("eq"),
        ...q.audit(),
    },
    unique: [{ columns: ["ownerId", "productSlug"] }],

    // Declared, not left to q.scope("owner"): the compiler does not count the auto-derived
    // owner scope when it checks that a USER resource is scoped to its owner.
    firewall: [{ field: "ownerId", equals: "ctx.userId" }],

    guards: { createable: ["productSlug"], updatable: [] },

    read: { access: { roles: ["USER"] }, pageSize: 100 },
    create: { access: { roles: ["USER"] } },
    delete: { access: { roles: ["USER"] }, mode: "hard" },
});
