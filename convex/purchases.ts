import { v } from "convex/values";
import { mutation } from "./_generated/server";

export const finalizeWithGatePass = mutation({
  args: {
    sessionId: v.id("sessions"),
    distributorId: v.id("distributors"),
    billNumber: v.string(),
    billDate: v.string(),
    items: v.array(
      v.object({
        productId: v.id("products"),
        unitsBought: v.number(),
        totalPrice: v.number(),
        ratePerUnit: v.number(),
        weightPerUnitKg: v.number(),
        weightType: v.union(v.literal("kg"), v.literal("box"), v.literal("litre")),
        priceMode: v.union(v.literal("total"), v.literal("unit"))
      })
    ),
    bags: v.optional(
      v.array(
        v.object({
          bagNumber: v.number(),
          totalWeightKg: v.number(),
          sealLabel: v.optional(v.string()),
          isBundled: v.boolean(),
          items: v.array(
            v.object({
              productId: v.id("products"),
              unitsInBag: v.number()
            })
          )
        })
      )
    ),
    courierFeePerBag: v.optional(v.number()),
    courierFeeOverride: v.optional(v.number()),
    courierNote: v.optional(v.string()),
    smallBagCount: v.optional(v.number()),
    bigBagCount: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    const totalAmount = args.items.reduce((sum, item) => sum + item.totalPrice, 0);
    const billId = await ctx.db.insert("bills", {
      sessionId: args.sessionId,
      distributorId: args.distributorId,
      billNumber: args.billNumber,
      billDate: args.billDate,
      totalAmount
    });

    const billItemIdsByProduct = new Map<string, any>();
    for (const item of args.items) {
      const ratePerKg = item.weightPerUnitKg ? Number((item.ratePerUnit / item.weightPerUnitKg).toFixed(2)) : 0;
      const billItemId = await ctx.db.insert("billItems", {
        billId,
        productId: item.productId,
        unitsBought: item.unitsBought,
        totalPrice: item.totalPrice,
        ratePerUnit: item.ratePerUnit,
        weightPerUnitKg: item.weightPerUnitKg,
        ratePerKg,
        weightType: item.weightType
      });
      billItemIdsByProduct.set(item.productId, billItemId);
      await ctx.db.insert("purchasePriceHistory", {
        productId: item.productId,
        distributorId: args.distributorId,
        billId,
        sessionId: args.sessionId,
        ratePerUnit: item.ratePerUnit,
        ratePerKg,
        purchaseDate: args.billDate,
        unitsBought: item.unitsBought,
        totalPrice: item.totalPrice
      });

      const requirements = await ctx.db
        .query("purchaseRequirements")
        .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
        .filter((q) => q.eq(q.field("productId"), item.productId))
        .collect();
      for (const requirement of requirements) {
        const remainingQty = Math.max(requirement.qtyRequired - item.unitsBought, 0);
        if (remainingQty > 0) {
          await ctx.db.patch(requirement._id, { qtyRequired: remainingQty });
        } else {
          await ctx.db.delete(requirement._id);
        }
      }

      const existingVerification = await ctx.db
        .query("deliveryVerifications")
        .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
        .filter((q) =>
          q.and(
            q.eq(q.field("distributorId"), args.distributorId),
            q.eq(q.field("productId"), item.productId)
          )
        )
        .first();
      if (existingVerification) {
        await ctx.db.patch(existingVerification._id, {
          expectedQty: existingVerification.expectedQty + item.unitsBought,
          status: "pending"
        });
      } else {
        await ctx.db.insert("deliveryVerifications", {
          sessionId: args.sessionId,
          distributorId: args.distributorId,
          productId: item.productId,
          expectedQty: item.unitsBought,
          status: "pending"
        });
      }
    }

    const bags = args.bags ?? [];
    const bagCount = bags.length;
    const courierFeeTotal =
      args.courierFeeOverride ??
      (((args.smallBagCount ?? 0) * 11 + (args.bigBagCount ?? 0) * 21) ||
        (args.courierFeePerBag ?? 0) * bagCount);
    const gatePassId = await ctx.db.insert("gatePasses", {
      billId,
      distributorId: args.distributorId,
      sessionId: args.sessionId,
      courierFeePerBag: args.courierFeePerBag,
      courierFeeTotal,
      courierNote: args.courierNote,
      smallBagCount: args.smallBagCount,
      bigBagCount: args.bigBagCount,
      generatedAt: Date.now()
    });

    for (const bag of bags) {
      const bagId = await ctx.db.insert("gatePassBags", {
        gatePassId,
        bagNumber: bag.bagNumber,
        totalWeightKg: bag.totalWeightKg,
        sealLabel: bag.sealLabel,
        isBundled: bag.isBundled
      });
      for (const item of bag.items) {
        const billItemId = billItemIdsByProduct.get(item.productId);
        if (!billItemId) continue;
        await ctx.db.insert("gatePassBagItems", {
          bagId,
          billItemId,
          unitsInBag: item.unitsInBag
        });
      }
    }

    const session = await ctx.db.get(args.sessionId);
    if (session) {
      await ctx.db.patch(args.sessionId, {
        totalSpent: (session.totalSpent ?? 0) + totalAmount,
        courierTotal: (session.courierTotal ?? 0) + courierFeeTotal
      });
    }

    return gatePassId;
  }
});

export const updateFinalizedBill = mutation({
  args: {
    billId: v.id("bills"),
    gatePassId: v.optional(v.id("gatePasses")),
    sessionId: v.id("sessions"),
    distributorId: v.id("distributors"),
    billNumber: v.string(),
    billDate: v.string(),
    items: v.array(
      v.object({
        productId: v.id("products"),
        unitsBought: v.number(),
        totalPrice: v.number(),
        ratePerUnit: v.number(),
        weightPerUnitKg: v.number(),
        weightType: v.union(v.literal("kg"), v.literal("box"), v.literal("litre")),
        priceMode: v.union(v.literal("total"), v.literal("unit"))
      })
    ),
    bags: v.optional(
      v.array(
        v.object({
          bagNumber: v.number(),
          totalWeightKg: v.number(),
          sealLabel: v.optional(v.string()),
          isBundled: v.boolean(),
          items: v.array(
            v.object({
              productId: v.id("products"),
              unitsInBag: v.number()
            })
          )
        })
      )
    ),
    courierFeePerBag: v.optional(v.number()),
    courierFeeOverride: v.optional(v.number()),
    courierNote: v.optional(v.string()),
    smallBagCount: v.optional(v.number()),
    bigBagCount: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    const existingBill = await ctx.db.get(args.billId);
    if (!existingBill) throw new Error("Bill not found");

    const existingGatePass =
      (args.gatePassId ? await ctx.db.get(args.gatePassId) : null) ??
      (await ctx.db.query("gatePasses").withIndex("by_bill", (q) => q.eq("billId", args.billId)).first());

    const oldBillItems = await ctx.db.query("billItems").withIndex("by_bill", (q) => q.eq("billId", args.billId)).collect();
    const oldPurchaseHistory = (await ctx.db
      .query("purchasePriceHistory")
      .withIndex("by_session", (q) => q.eq("sessionId", existingBill.sessionId))
      .collect()).filter((entry) => entry.billId === args.billId);

    const oldUnitsByProduct = new Map<string, number>();
    oldBillItems.forEach((item) => {
      oldUnitsByProduct.set(item.productId, (oldUnitsByProduct.get(item.productId) ?? 0) + item.unitsBought);
    });
    const newUnitsByProduct = new Map<string, number>();
    args.items.forEach((item) => {
      newUnitsByProduct.set(item.productId, (newUnitsByProduct.get(item.productId) ?? 0) + item.unitsBought);
    });

    const newTotalAmount = args.items.reduce((sum, item) => sum + item.totalPrice, 0);
    const oldTotalAmount = existingBill.totalAmount;
    const oldCourierTotal = existingGatePass?.courierFeeTotal ?? 0;
    const newCourierTotal =
      args.courierFeeOverride ??
      (((args.smallBagCount ?? 0) * 11 + (args.bigBagCount ?? 0) * 21) ||
        (args.courierFeePerBag ?? 0) * (args.bags ?? []).length);

    await ctx.db.patch(args.billId, {
      distributorId: args.distributorId,
      billNumber: args.billNumber,
      billDate: args.billDate,
      totalAmount: newTotalAmount
    });

    for (const entry of oldPurchaseHistory) {
      await ctx.db.delete(entry._id);
    }
    for (const item of oldBillItems) {
      await ctx.db.delete(item._id);
    }

    for (const item of args.items) {
      const ratePerKg = item.weightPerUnitKg ? Number((item.ratePerUnit / item.weightPerUnitKg).toFixed(2)) : 0;
      await ctx.db.insert("billItems", {
        billId: args.billId,
        productId: item.productId,
        unitsBought: item.unitsBought,
        totalPrice: item.totalPrice,
        ratePerUnit: item.ratePerUnit,
        weightPerUnitKg: item.weightPerUnitKg,
        ratePerKg,
        weightType: item.weightType
      });
      await ctx.db.insert("purchasePriceHistory", {
        productId: item.productId,
        distributorId: args.distributorId,
        billId: args.billId,
        sessionId: existingBill.sessionId,
        ratePerUnit: item.ratePerUnit,
        ratePerKg,
        purchaseDate: args.billDate,
        unitsBought: item.unitsBought,
        totalPrice: item.totalPrice
      });
    }

    const allProductIds = new Set<string>([
      ...Array.from(oldUnitsByProduct.keys()),
      ...Array.from(newUnitsByProduct.keys())
    ]);
    for (const productId of allProductIds) {
      const delta = (newUnitsByProduct.get(productId) ?? 0) - (oldUnitsByProduct.get(productId) ?? 0);
      if (!delta) continue;

      const existingRequirement = (await ctx.db
        .query("purchaseRequirements")
        .withIndex("by_session", (q) => q.eq("sessionId", existingBill.sessionId))
        .collect()).find((entry) => entry.productId === productId);
      const nextRemaining = (existingRequirement?.qtyRequired ?? 0) - delta;
      if (existingRequirement) {
        if (nextRemaining > 0) {
          await ctx.db.patch(existingRequirement._id, { qtyRequired: nextRemaining });
        } else {
          await ctx.db.delete(existingRequirement._id);
        }
      } else if (nextRemaining > 0) {
        await ctx.db.insert("purchaseRequirements", {
          sessionId: existingBill.sessionId,
          productId: productId as any,
          qtyRequired: nextRemaining
        });
      }
    }

    const adjustVerification = async (
      distributorId: typeof existingBill.distributorId,
      productId: string,
      delta: number
    ) => {
      if (!delta) return;
      const row = (await ctx.db
        .query("deliveryVerifications")
        .withIndex("by_session", (q) => q.eq("sessionId", existingBill.sessionId))
        .collect()).find((entry) => entry.distributorId === distributorId && entry.productId === productId);
      const nextExpected = (row?.expectedQty ?? 0) + delta;
      if (row) {
        if (nextExpected > 0) {
          await ctx.db.patch(row._id, {
            expectedQty: nextExpected,
            status: "pending",
            receivedQty: undefined,
            verifiedAt: undefined
          });
        } else {
          await ctx.db.delete(row._id);
        }
      } else if (nextExpected > 0) {
        await ctx.db.insert("deliveryVerifications", {
          sessionId: existingBill.sessionId,
          distributorId,
          productId: productId as any,
          expectedQty: nextExpected,
          status: "pending"
        });
      }
    };

    for (const [productId, units] of oldUnitsByProduct.entries()) {
      await adjustVerification(existingBill.distributorId, productId, -units);
    }
    for (const [productId, units] of newUnitsByProduct.entries()) {
      await adjustVerification(args.distributorId, productId, units);
    }

    if (existingGatePass) {
      const bagRows = await ctx.db.query("gatePassBags").withIndex("by_gatePass", (q) => q.eq("gatePassId", existingGatePass._id)).collect();
      for (const bag of bagRows) {
        const bagItems = await ctx.db.query("gatePassBagItems").withIndex("by_bag", (q) => q.eq("bagId", bag._id)).collect();
        for (const bagItem of bagItems) {
          await ctx.db.delete(bagItem._id);
        }
        await ctx.db.delete(bag._id);
      }
      await ctx.db.patch(existingGatePass._id, {
        distributorId: args.distributorId,
        courierFeePerBag: args.courierFeePerBag,
        courierFeeTotal: newCourierTotal,
        courierNote: args.courierNote,
        smallBagCount: args.smallBagCount,
        bigBagCount: args.bigBagCount,
        generatedAt: Date.now()
      });
    }

    const session = await ctx.db.get(existingBill.sessionId);
    if (session) {
      await ctx.db.patch(existingBill.sessionId, {
        totalSpent: Math.max(0, (session.totalSpent ?? 0) - oldTotalAmount + newTotalAmount),
        courierTotal: Math.max(0, (session.courierTotal ?? 0) - oldCourierTotal + newCourierTotal)
      });
    }

    return existingGatePass?._id ?? null;
  }
});
