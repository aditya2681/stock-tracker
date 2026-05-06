import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const bySession = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("gatePasses")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();
  }
});

export const create = mutation({
  args: {
    billId: v.id("bills"),
    distributorId: v.id("distributors"),
    sessionId: v.id("sessions"),
    courierFeePerBag: v.optional(v.number()),
    courierFeeTotal: v.number(),
    courierNote: v.optional(v.string()),
    bags: v.array(
      v.object({
        bagNumber: v.number(),
        totalWeightKg: v.number(),
        sealLabel: v.optional(v.string()),
        isBundled: v.boolean(),
        items: v.array(
          v.object({
            billItemId: v.id("billItems"),
            unitsInBag: v.number()
          })
        )
      })
    )
  },
  handler: async (ctx, args) => {
    const gatePassId = await ctx.db.insert("gatePasses", {
      billId: args.billId,
      distributorId: args.distributorId,
      sessionId: args.sessionId,
      courierFeePerBag: args.courierFeePerBag,
      courierFeeTotal: args.courierFeeTotal,
      courierNote: args.courierNote,
      generatedAt: Date.now()
    });

    for (const bag of args.bags) {
      const bagId = await ctx.db.insert("gatePassBags", {
        gatePassId,
        bagNumber: bag.bagNumber,
        totalWeightKg: bag.totalWeightKg,
        sealLabel: bag.sealLabel,
        isBundled: bag.isBundled
      });

      for (const item of bag.items) {
        await ctx.db.insert("gatePassBagItems", {
          bagId,
          billItemId: item.billItemId,
          unitsInBag: item.unitsInBag
        });
      }
    }

    return gatePassId;
  }
});

export const updateCourierRate = mutation({
  args: {
    gatePassId: v.id("gatePasses"),
    rate: v.number()
  },
  handler: async (ctx, args) => {
    const gatePass = await ctx.db.get(args.gatePassId);
    if (!gatePass) throw new Error("Gate pass not found");
    const bags = await ctx.db.query("gatePassBags").withIndex("by_gatePass", (q) => q.eq("gatePassId", args.gatePassId)).collect();
    await ctx.db.patch(args.gatePassId, {
      courierFeePerBag: args.rate,
      courierFeeTotal: args.rate * bags.length
    });
    return { ok: true };
  }
});
