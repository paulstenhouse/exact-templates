/**
 * The mailing list ("15% off your first order"). Anyone may join (actions/join.ts); nobody but staff can
 * read it, and support staff (appmanager) see addresses masked.
 */
import { feature, q } from "@quickback/compiler";

export default feature("subscribers", {
    columns: {
        id: q.id(),
        email: q.text({ email: true, maxLength: 254 }).required().unique(),
        ...q.audit(),
        ...q.softDelete(),
    },

    // FIREWALL: the list is the store's, not a shopper's or a tenant's. Access (staff only) is the gate.
    firewall: { exception: true },
    guards: { createable: [], updatable: [] },

    // MASKING: j***@e******.com for everyone but sysadmins.
    masking: {
        email: { type: "email", show: { roles: ["SYSADMIN"] } },
    },

    read: { access: { or: [{ roles: ["SYSADMIN"] }, { userRole: ["appmanager"] }] } },
    delete: { access: { roles: ["SYSADMIN"] }, mode: "soft" },
});
