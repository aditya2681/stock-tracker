import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("sessions").withIndex("by_date").order("desc").collect();
  }
});

export const active = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("sessions")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .first();
  }
});

export const create = mutation({
  args: {
    name: v.string(),
    date: v.string(),
    openingBalance: v.number()
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("sessions", {
      name: args.name,
      date: args.date,
      status: "open",
      openingBalance: args.openingBalance,
      totalSpent: 0,
      courierTotal: 0
    });
  }
});

export const updateBasics = mutation({
  args: {
    sessionId: v.id("sessions"),
    name: v.string(),
    date: v.string()
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.sessionId, {
      name: args.name,
      date: args.date
    });
    return { ok: true };
  }
});

export const remove = mutation({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    const [requirements, bills, gatePasses, verifications] = await Promise.all([
      ctx.db.query("purchaseRequirements").withIndex("by_session", (q) => q.eq("sessionId", args.sessionId)).take(1),
      ctx.db.query("bills").withIndex("by_session", (q) => q.eq("sessionId", args.sessionId)).take(1),
      ctx.db.query("gatePasses").withIndex("by_session", (q) => q.eq("sessionId", args.sessionId)).take(1),
      ctx.db.query("deliveryVerifications").withIndex("by_session", (q) => q.eq("sessionId", args.sessionId)).take(1)
    ]);
    if (requirements.length || bills.length || gatePasses.length || verifications.length) {
      throw new Error("Session cannot be deleted after activity has been recorded");
    }
    await ctx.db.delete(args.sessionId);
    return { ok: true };
  }
});

export const updateBalances = mutation({
  args: {
    sessionId: v.id("sessions"),
    openingBalance: v.optional(v.number()),
    closingBalance: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    const patch: Record<string, number | undefined> = {};
    if (typeof args.openingBalance === "number") patch.openingBalance = args.openingBalance;
    if (typeof args.closingBalance === "number") patch.closingBalance = args.closingBalance;
    await ctx.db.patch(args.sessionId, patch);
    return { ok: true };
  }
});
