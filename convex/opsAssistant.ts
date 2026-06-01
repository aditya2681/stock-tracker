import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

const entryStatus = v.union(
  v.literal("resolved"),
  v.literal("ambiguous"),
  v.literal("unresolved"),
  v.literal("unsupported"),
  v.literal("skipped"),
  v.literal("applied")
);

function parseJson<T>(value: string): T {
  return JSON.parse(value) as T;
}

export const getDraft = query({
  args: {
    draftId: v.id("operationDrafts")
  },
  handler: async (ctx, args) => {
    const draft = await ctx.db.get(args.draftId);
    if (!draft) return null;
    const entries = await ctx.db
      .query("operationDraftEntries")
      .withIndex("by_draftId", (q) => q.eq("draftId", args.draftId))
      .collect();

    return {
      id: draft._id,
      sourceText: draft.sourceText,
      selectedSessionId: draft.selectedSessionId,
      parseStatus: draft.parseStatus,
      warning: draft.warning,
      modelName: draft.modelName,
      createdAt: draft.createdAt,
      appliedAt: draft.appliedAt,
      entries: entries.map((entry) => ({
        id: entry._id,
        operationKind: entry.operationKind,
        targetTable: entry.targetTable,
        summary: entry.summary,
        status: entry.status,
        payload: parseJson<Record<string, unknown>>(entry.payloadJson),
        candidates: parseJson<Array<Record<string, unknown>>>(entry.candidatesJson),
        warning: entry.warning
      }))
    };
  }
});

export const storeDraft = internalMutation({
  args: {
    sourceText: v.string(),
    selectedSessionId: v.optional(v.id("sessions")),
    parseStatus: v.union(
      v.literal("parsed"),
      v.literal("needs_review"),
      v.literal("failed"),
      v.literal("applied")
    ),
    warning: v.optional(v.string()),
    modelName: v.optional(v.string()),
    createdBy: v.optional(v.string()),
    entries: v.array(
      v.object({
        operationKind: v.string(),
        targetTable: v.string(),
        summary: v.string(),
        status: entryStatus,
        payloadJson: v.string(),
        candidatesJson: v.string(),
        warning: v.optional(v.string())
      })
    )
  },
  handler: async (ctx, args) => {
    const createdAt = Date.now();
    const draftId = await ctx.db.insert("operationDrafts", {
      sourceText: args.sourceText,
      selectedSessionId: args.selectedSessionId,
      parseStatus: args.parseStatus,
      warning: args.warning,
      modelName: args.modelName,
      createdBy: args.createdBy,
      createdAt
    });

    for (const entry of args.entries) {
      await ctx.db.insert("operationDraftEntries", {
        draftId,
        operationKind: entry.operationKind,
        targetTable: entry.targetTable,
        summary: entry.summary,
        status: entry.status,
        payloadJson: entry.payloadJson,
        candidatesJson: entry.candidatesJson,
        warning: entry.warning,
        createdAt
      });
    }

    return draftId;
  }
});

export const applyDraft = mutation({
  args: {
    draftId: v.id("operationDrafts"),
    entries: v.array(
      v.object({
        id: v.id("operationDraftEntries"),
        operationKind: v.string(),
        status: entryStatus,
        payloadJson: v.string()
      })
    )
  },
  handler: async (ctx, args) => {
    const draft = await ctx.db.get(args.draftId);
    if (!draft) {
      throw new Error("Draft not found");
    }

    const now = Date.now();

    const ensureProductDistributorLink = async (productId: any, distributorId: any) => {
      const existingLinks = await ctx.db
        .query("productDistributors")
        .withIndex("by_product", (q) => q.eq("productId", productId))
        .collect();
      const alreadyLinked = existingLinks.some((entry) => entry.distributorId === distributorId);
      if (!alreadyLinked) {
        await ctx.db.insert("productDistributors", {
          productId,
          distributorId
        });
      }
    };

    for (const draftEntry of args.entries) {
      if (draftEntry.status !== "resolved") continue;

      const payload = parseJson<Record<string, any>>(draftEntry.payloadJson);

      switch (draftEntry.operationKind) {
        case "create_product": {
          const productId = await ctx.db.insert("products", {
            name: String(payload.name ?? "").trim(),
            unitLabel: String(payload.unitLabel ?? "bag"),
            weightPerUnitKg: Number(payload.weightPerUnitKg ?? 0),
            currentStockQty: Number(payload.currentStockQty ?? 0),
            minStockAlert: Number(payload.minStockAlert ?? 0),
            createdAt: now
          });
          for (const distributorId of Array.isArray(payload.linkedDistributorIds) ? payload.linkedDistributorIds : []) {
            await ensureProductDistributorLink(productId, distributorId);
          }
          break;
        }
        case "update_product": {
          if (!payload.productId) break;
          await ctx.db.patch(payload.productId, {
            name: String(payload.name ?? ""),
            unitLabel: String(payload.unitLabel ?? "bag"),
            weightPerUnitKg: Number(payload.weightPerUnitKg ?? 0),
            currentStockQty: Number(payload.currentStockQty ?? 0),
            minStockAlert: Number(payload.minStockAlert ?? 0)
          });
          for (const distributorId of Array.isArray(payload.linkedDistributorIds) ? payload.linkedDistributorIds : []) {
            await ensureProductDistributorLink(payload.productId, distributorId);
          }
          break;
        }
        case "create_distributor": {
          await ctx.db.insert("distributors", {
            name: String(payload.name ?? "").trim(),
            shortCode: String(payload.shortCode ?? "").trim(),
            phone: payload.phone ? String(payload.phone) : undefined,
            area: payload.area ? String(payload.area) : undefined,
            isActive: true
          });
          break;
        }
        case "update_distributor": {
          if (!payload.distributorId) break;
          await ctx.db.patch(payload.distributorId, {
            name: String(payload.name ?? ""),
            shortCode: String(payload.shortCode ?? ""),
            phone: payload.phone ? String(payload.phone) : undefined,
            area: payload.area ? String(payload.area) : undefined
          });
          break;
        }
        case "link_product_distributor": {
          if (payload.productId && payload.distributorId) {
            await ensureProductDistributorLink(payload.productId, payload.distributorId);
          }
          break;
        }
        case "create_session": {
          await ctx.db.insert("sessions", {
            name: String(payload.name ?? "Utility session"),
            date: String(payload.date ?? new Date().toISOString().slice(0, 10)),
            status: "open",
            openingBalance: Number(payload.openingBalance ?? 0),
            totalSpent: 0,
            courierTotal: 0,
            notes: payload.notes ? String(payload.notes) : undefined
          });
          break;
        }
        case "update_session": {
          if (!payload.sessionId) break;
          await ctx.db.patch(payload.sessionId, {
            name: payload.name ? String(payload.name) : undefined,
            date: payload.date ? String(payload.date) : undefined,
            openingBalance:
              typeof payload.openingBalance === "number" ? Number(payload.openingBalance) : undefined,
            closingBalance:
              typeof payload.closingBalance === "number" ? Number(payload.closingBalance) : undefined,
            notes: payload.notes ? String(payload.notes) : undefined
          });
          break;
        }
        case "plan_purchase": {
          if (!payload.sessionId || !payload.productId) break;
          const existing = await ctx.db
            .query("purchaseRequirements")
            .withIndex("by_session", (q) => q.eq("sessionId", payload.sessionId))
            .filter((q) => q.eq(q.field("productId"), payload.productId))
            .first();

          if (existing) {
            await ctx.db.patch(existing._id, {
              qtyRequired: Number(payload.qtyRequired ?? existing.qtyRequired),
              notes: payload.notes ? String(payload.notes) : existing.notes
            });
          } else {
            await ctx.db.insert("purchaseRequirements", {
              sessionId: payload.sessionId,
              productId: payload.productId,
              qtyRequired: Number(payload.qtyRequired ?? 0),
              notes: payload.notes ? String(payload.notes) : undefined
            });
          }
          break;
        }
        case "update_stock": {
          if (!payload.productId) break;
          const productId = payload.productId as Id<"products">;
          const product = await ctx.db.get(productId);
          if (!product) break;
          const newQty = Number(payload.newQty ?? product.currentStockQty);
          await ctx.db.patch(productId, { currentStockQty: newQty });
          await ctx.db.insert("stockLog", {
            productId,
            previousQty: product.currentStockQty,
            newQty,
            reason: payload.reason ?? "manual_count",
            notes: payload.notes ? String(payload.notes) : "Utility update",
            updatedAt: now
          });
          break;
        }
        case "log_enquiry": {
          if (!payload.productId || !payload.distributorId) break;
          const ratePerUnit = Number(payload.quotedRatePerUnit ?? 0);
          const weightPerUnitKg =
            typeof payload.weightPerUnitKg === "number" ? Number(payload.weightPerUnitKg) : undefined;
          await ctx.db.insert("enquiryPriceHistory", {
            productId: payload.productId,
            distributorId: payload.distributorId,
            quotedRatePerUnit: ratePerUnit,
            quotedRatePerKg: weightPerUnitKg ? ratePerUnit / weightPerUnitKg : undefined,
            weightPerUnitKg,
            enquiryDate: String(payload.enquiryDate ?? new Date().toISOString().slice(0, 10)),
            notes: payload.notes ? String(payload.notes) : undefined,
            source: payload.source ?? "other",
            sessionId: payload.sessionId
          });
          break;
        }
        case "record_purchase": {
          if (!payload.sessionId || !payload.distributorId || !Array.isArray(payload.items) || !payload.items.length) {
            break;
          }
          const sessionId = payload.sessionId as Id<"sessions">;
          const distributorId = payload.distributorId as Id<"distributors">;
          const billDate = String(payload.billDate ?? new Date().toISOString().slice(0, 10));
          const billNumber = String(payload.billNumber ?? `UTIL-${now}`);
          const totalAmount = payload.items.reduce((sum: number, item: Record<string, any>) => sum + Number(item.totalPrice ?? 0), 0);
          const billId = await ctx.db.insert("bills", {
            sessionId,
            distributorId,
            billNumber,
            billDate,
            totalAmount
          });

          for (const item of payload.items) {
            if (!item.productId) continue;
            const unitsBought = Number(item.unitsBought ?? 0);
            const totalPrice = Number(item.totalPrice ?? 0);
            const weightPerUnitKg = Number(item.weightPerUnitKg ?? 0);
            const ratePerUnit = unitsBought ? Number((totalPrice / unitsBought).toFixed(2)) : 0;
            const ratePerKg = weightPerUnitKg ? Number((ratePerUnit / weightPerUnitKg).toFixed(2)) : 0;

            await ctx.db.insert("billItems", {
              billId,
              productId: item.productId,
              unitsBought,
              totalPrice,
              ratePerUnit,
              weightPerUnitKg,
              ratePerKg,
              weightType: item.weightType ?? "kg"
            });
            await ctx.db.insert("purchasePriceHistory", {
              productId: item.productId,
              distributorId,
              billId,
              sessionId,
              ratePerUnit,
              ratePerKg,
              purchaseDate: billDate,
              unitsBought,
              totalPrice
            });

            const requirements = await ctx.db
              .query("purchaseRequirements")
              .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
              .filter((q) => q.eq(q.field("productId"), item.productId))
              .collect();

            for (const requirement of requirements) {
              const remainingQty = Math.max(requirement.qtyRequired - unitsBought, 0);
              if (remainingQty > 0) {
                await ctx.db.patch(requirement._id, { qtyRequired: remainingQty });
              } else {
                await ctx.db.delete(requirement._id);
              }
            }

            const existingVerification = await ctx.db
              .query("deliveryVerifications")
              .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
              .filter((q) =>
                q.and(
                  q.eq(q.field("distributorId"), distributorId),
                  q.eq(q.field("productId"), item.productId)
                )
              )
              .first();
            if (existingVerification) {
              await ctx.db.patch(existingVerification._id, {
                expectedQty: existingVerification.expectedQty + unitsBought,
                status: "pending"
              });
            } else {
              await ctx.db.insert("deliveryVerifications", {
                sessionId,
                distributorId,
                productId: item.productId,
                expectedQty: unitsBought,
                status: "pending"
              });
            }
          }

          const session = await ctx.db.get(sessionId);
          if (session) {
            await ctx.db.patch(sessionId, {
              totalSpent: (session.totalSpent ?? 0) + totalAmount
            });
          }
          break;
        }
        case "verify_delivery": {
          if (!payload.sessionId || !payload.distributorId || !payload.productId) break;
          const sessionId = payload.sessionId as Id<"sessions">;
          const distributorId = payload.distributorId as Id<"distributors">;
          const productId = payload.productId as Id<"products">;
          const verification = await ctx.db
            .query("deliveryVerifications")
            .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
            .filter((q) =>
              q.and(
                q.eq(q.field("distributorId"), distributorId),
                q.eq(q.field("productId"), productId)
              )
            )
            .first();
          const product = await ctx.db.get(productId);
          if (!verification || !product) break;

          const receivedQty = Number(payload.receivedQty ?? verification.receivedQty ?? verification.expectedQty);
          const previousReceivedQty = verification.receivedQty ?? 0;
          const delta = receivedQty - previousReceivedQty;

          await ctx.db.patch(verification._id, {
            receivedQty,
            status: payload.status ?? "match",
            notes: payload.notes ? String(payload.notes) : undefined,
            verifiedAt: now
          });
          await ctx.db.patch(productId, {
            currentStockQty: product.currentStockQty + delta
          });
          await ctx.db.insert("stockLog", {
            productId,
            previousQty: product.currentStockQty,
            newQty: product.currentStockQty + delta,
            reason: "received",
            notes: payload.notes ? String(payload.notes) : "Utility verification",
            updatedAt: now
          });
          break;
        }
        default:
          break;
      }

      await ctx.db.patch(draftEntry.id, {
        status: "applied",
        payloadJson: draftEntry.payloadJson
      });
    }

    await ctx.db.patch(args.draftId, {
      parseStatus: "applied",
      appliedAt: now
    });

    return { ok: true };
  }
});
