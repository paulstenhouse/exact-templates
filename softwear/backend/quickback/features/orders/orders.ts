/**
 * Orders. A shopper reads their own; nobody creates, edits or deletes one through CRUD.
 * An order is made by `POST /api/v1/checkout` (actions/checkout.ts) and moves on only
 * through the transitions below, which are staff's. No payment is taken: this is a demo.
 */
import { feature, q } from "@quickback/compiler";

export default feature("orders", {
    columns: {
        id: q.id(),
        // FIREWALL: WHERE owner_id = <the caller>. Staff (sysadmin) read past it.
        ownerId: q.scope("owner"),
        // The number a shopper sees and the app's /order/:id route carries, like SW-104233.
        number: q.text().required().unique().filterable("eq"),
        status: q.enum(["placed", "shipped", "delivered", "cancelled"]).default("placed").required(),
        email: q.text().required(),
        shipName: q.text().required(),
        shipAddress: q.text().required(),
        shipCity: q.text().required(),
        shipZip: q.text().required(),
        shippingMethod: q.enum(["standard", "express"]).default("standard").required(),
        promoCode: q.text().optional(),
        subtotalCents: q.int().required(),
        discountCents: q.int().required(),
        shippingCents: q.int().required(),
        totalCents: q.int().required(),
        placedAt: q.timestamp().required(),
        shippedAt: q.timestamp().optional(),
        deliveredAt: q.timestamp().optional(),
        cancelledAt: q.timestamp().optional(),
        ...q.audit(),
        ...q.softDelete(),
    },

    // Declared, not left to q.scope("owner"): the compiler does not count the auto-derived
    // owner scope when it checks that a USER resource is scoped to its owner.
    firewall: [{ field: "ownerId", equals: "ctx.userId" }, { field: "deletedAt", isNull: true }],

    // GUARDS: no field is writable through the API. Totals are the server's arithmetic,
    // and `status` belongs to the transitions.
    guards: {
        createable: [],
        updatable: [],
        protected: { status: ["ship", "deliver", "cancel"] },
    },

    // MASKING: where an order ships is shown to its owner and to staff; anyone else
    // who is ever given read access gets a masked row.
    masking: {
        email: { type: "email", show: { or: "owner", roles: ["SYSADMIN"] } },
        shipName: { type: "name", show: { or: "owner", roles: ["SYSADMIN"] } },
        shipAddress: { type: "redact", show: { or: "owner", roles: ["SYSADMIN"] } },
    },

    // ACCESS
    read: { access: { or: [{ roles: ["USER"] }, { roles: ["SYSADMIN"] }] }, pageSize: 50 },

    // placed -> shipped -> delivered, or placed -> cancelled. Staff only.
    transitions: {
        ship: {
            field: "status", from: "placed", to: "shipped",
            stamp: { at: "shippedAt" },
            access: { roles: ["SYSADMIN"] },
        },
        deliver: {
            field: "status", from: "shipped", to: "delivered",
            stamp: { at: "deliveredAt" },
            access: { roles: ["SYSADMIN"] },
        },
        cancel: {
            field: "status", from: "placed", to: "cancelled",
            stamp: { at: "cancelledAt" },
            access: { roles: ["SYSADMIN"] },
        },
    },
});
