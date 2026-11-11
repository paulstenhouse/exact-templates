/**
 * "Tell me when it's back": an address against a sold-out style. No email is sent in this demo.
 */
import { feature, q } from "@quickback/compiler";

export default feature("restockRequests", {
    columns: {
        id: q.id(),
        email: q.text({ email: true, maxLength: 254 }).required(),
        productSlug: q.text().required(),
        ...q.audit(),
        ...q.softDelete(),
    },
    unique: [{ columns: ["email", "productSlug"] }],

    // FIREWALL: the list is the store's, not a shopper's or a tenant's. Access (staff only) is the gate.
    firewall: { exception: true },
    guards: { createable: [], updatable: [] },

    masking: {
        email: { type: "email", show: { roles: ["SYSADMIN"] } },
    },

    read: { access: { or: [{ roles: ["SYSADMIN"] }, { userRole: ["appmanager"] }] } },
});
