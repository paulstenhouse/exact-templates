/**
 * The store's promo codes. Only staff can list them, so nobody can enumerate the codes:
 * a shopper asks what one code is worth (actions/check.ts) and checkout prices it.
 */
import { feature, q } from "@quickback/compiler";

export default feature("promoCodes", {
    columns: {
        id: q.id(),
        code: q.text().required().unique(),
        pct: q.int().required().check("BETWEEN 1 AND 100"),
        // WELCOME15 is for a first order: one use per shopper.
        oncePerUser: q.bool().default(false).required(),
        active: q.bool().default(true).required(),
        ...q.audit(),
        ...q.softDelete(),
    },

    // FIREWALL: the codes are the store's, not a shopper's or a tenant's. Access (staff only) is the gate.
    firewall: { exception: true },
    guards: {
        createable: ["code", "pct", "oncePerUser", "active"],
        updatable: ["pct", "oncePerUser", "active"],
        immutable: ["code"],
    },

    read: { access: { roles: ["SYSADMIN"] } },
    create: { access: { roles: ["SYSADMIN"] } },
    update: { access: { roles: ["SYSADMIN"] } },
});
