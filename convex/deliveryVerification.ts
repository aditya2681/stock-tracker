import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const byDistributor = query({
  args: {
    sessionId: v.id("sessions"),
    distributorId: v.id("distributors")
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("deliveryVerifications")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .filter((q) => q.eq(q.field("distributorId"), args.distributorId))
      .collect();
  }
});

export const mark = mutation({
  args: {
    verificationId: v.id("deliveryVerifications"),
    receivedQty: v.number(),
    status: v.union(v.literal("pending"), v.literal("match"), v.literal("shortage")),
    notes: v.optional(v.string()),
    verifiedBy: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.verificationId, {
      receivedQty: args.receivedQty,
      status: args.status,
      notes: args.notes,
      verifiedBy: args.verifiedBy,
      verifiedAt: Date.now()
    });
    return { ok: true };
  }
});
