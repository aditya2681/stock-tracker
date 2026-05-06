import { query } from "./_generated/server";

export const snapshot = query({
  args: {},
  handler: async (ctx) => {
    const [
      products,
      distributors,
      productDistributors,
      sessions,
      purchaseRequirements,
      purchaseHistory,
      enquiryHistory,
      bills,
      billItems,
      gatePasses,
      gatePassBags,
      gatePassBagItems,
      stockLog,
      deliveryRows
    ] = await Promise.all([
      ctx.db.query("products").collect(),
      ctx.db.query("distributors").collect(),
      ctx.db.query("productDistributors").collect(),
      ctx.db.query("sessions").collect(),
      ctx.db.query("purchaseRequirements").collect(),
      ctx.db.query("purchasePriceHistory").collect(),
      ctx.db.query("enquiryPriceHistory").collect(),
      ctx.db.query("bills").collect(),
      ctx.db.query("billItems").collect(),
      ctx.db.query("gatePasses").collect(),
      ctx.db.query("gatePassBags").collect(),
      ctx.db.query("gatePassBagItems").collect(),
      ctx.db.query("stockLog").collect(),
      ctx.db.query("deliveryVerifications").collect()
    ]);

    const linkedDistributorIdsByProduct = new Map<string, string[]>();
    productDistributors.forEach((entry) => {
      const current = linkedDistributorIdsByProduct.get(entry.productId) ?? [];
      current.push(entry.distributorId);
      linkedDistributorIdsByProduct.set(entry.productId, current);
    });

    const snapshotProducts = products.map((product) => ({
      id: product._id,
      name: product.name,
      unitLabel: product.unitLabel,
      weightPerUnitKg: product.weightPerUnitKg,
      currentStockQty: product.currentStockQty,
      minStockAlert: product.minStockAlert,
      linkedDistributorIds: linkedDistributorIdsByProduct.get(product._id) ?? []
    }));

    const snapshotDistributors = distributors.map((distributor) => ({
      id: distributor._id,
      name: distributor.name,
      shortCode: distributor.shortCode,
      phone: distributor.phone,
      area: distributor.area,
      isActive: distributor.isActive
    }));

    const snapshotSessions = sessions
      .map((session) => ({
        id: session._id,
        name: session.name,
        date: session.date,
        status: session.status,
        openingBalance: session.openingBalance,
        closingBalance: session.closingBalance,
        notes: session.notes
      }))
      .sort((a, b) => b.date.localeCompare(a.date));

    const snapshotRegisterItems = purchaseRequirements.map((entry) => ({
      id: entry._id,
      sessionId: entry.sessionId,
      productId: entry.productId,
      qtyRequired: entry.qtyRequired,
      preferredDistributorId: entry.preferredDistributorId,
      notes: entry.notes
    }));

    const snapshotPurchaseHistory = purchaseHistory
      .map((entry) => ({
        id: entry._id,
        productId: entry.productId,
        distributorId: entry.distributorId,
        billId: entry.billId,
        sessionId: entry.sessionId,
        ratePerUnit: entry.ratePerUnit,
        ratePerKg: entry.ratePerKg,
        purchaseDate: entry.purchaseDate,
        unitsBought: entry.unitsBought,
        totalPrice: entry.totalPrice
      }))
      .sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate));

    const snapshotEnquiryHistory = enquiryHistory
      .map((entry) => ({
        id: entry._id,
        productId: entry.productId,
        distributorId: entry.distributorId,
        quotedRatePerUnit: entry.quotedRatePerUnit,
        quotedRatePerKg: entry.quotedRatePerKg,
        weightPerUnitKg: entry.weightPerUnitKg,
        enquiryDate: entry.enquiryDate,
        enquiredBy: entry.enquiredBy,
        notes: entry.notes,
        source: entry.source,
        sessionId: entry.sessionId
      }))
      .sort((a, b) => b.enquiryDate.localeCompare(a.enquiryDate));

    const billItemsByBill = new Map<string, typeof billItems>();
    billItems.forEach((item) => {
      const current = billItemsByBill.get(item.billId) ?? [];
      current.push(item);
      billItemsByBill.set(item.billId, current);
    });

    const snapshotBills = bills
      .map((bill) => ({
        id: bill._id,
        sessionId: bill.sessionId,
        distributorId: bill.distributorId,
        billNumber: bill.billNumber,
        billDate: bill.billDate,
        totalAmount: bill.totalAmount,
        items: (billItemsByBill.get(bill._id) ?? []).map((item) => ({
          id: item._id,
          productId: item.productId,
          unitsBought: item.unitsBought,
          totalPrice: item.totalPrice,
          ratePerUnit: item.ratePerUnit,
          weightPerUnitKg: item.weightPerUnitKg,
          ratePerKg: item.ratePerKg,
          weightType: item.weightType
        }))
      }))
      .sort((a, b) => b.billDate.localeCompare(a.billDate));

    const bagItemsByBag = new Map<string, typeof gatePassBagItems>();
    gatePassBagItems.forEach((item) => {
      const current = bagItemsByBag.get(item.bagId) ?? [];
      current.push(item);
      bagItemsByBag.set(item.bagId, current);
    });
    const billItemById = new Map(billItems.map((item) => [item._id, item]));
    const bagsByGatePass = new Map<string, typeof gatePassBags>();
    gatePassBags.forEach((bag) => {
      const current = bagsByGatePass.get(bag.gatePassId) ?? [];
      current.push(bag);
      bagsByGatePass.set(bag.gatePassId, current);
    });

    const snapshotGatePasses = gatePasses
      .map((gatePass) => ({
        id: gatePass._id,
        billId: gatePass.billId,
        distributorId: gatePass.distributorId,
        sessionId: gatePass.sessionId,
        courierFeePerBag: gatePass.courierFeePerBag,
        courierFeeTotal: gatePass.courierFeeTotal,
        courierNote: gatePass.courierNote,
        generatedAt: gatePass.generatedAt,
        bags: (bagsByGatePass.get(gatePass._id) ?? []).map((bag) => ({
          id: bag._id,
          bagNumber: bag.bagNumber,
          totalWeightKg: bag.totalWeightKg,
          sealLabel: bag.sealLabel,
          isBundled: bag.isBundled,
          items: (bagItemsByBag.get(bag._id) ?? []).map((item) => ({
            id: item._id,
            billItemId: item.billItemId,
            productId: billItemById.get(item.billItemId)?.productId,
            unitsInBag: item.unitsInBag
          }))
        }))
      }))
      .sort((a, b) => b.generatedAt - a.generatedAt);

    const snapshotStockLog = stockLog
      .map((entry) => ({
        id: entry._id,
        productId: entry.productId,
        previousQty: entry.previousQty,
        newQty: entry.newQty,
        reason: entry.reason,
        notes: entry.notes,
        updatedAt: entry.updatedAt
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt);

    const verificationGroups = new Map<
      string,
      {
        id: string;
        sessionId: string;
        distributorId: string;
        verifiedAt?: number;
        items: Array<{
          productId: string;
          expectedQty: number;
          receivedQty?: number;
          status: "pending" | "match" | "shortage";
        }>;
      }
    >();
    deliveryRows.forEach((row) => {
      const key = `${row.sessionId}-${row.distributorId}`;
      const current = verificationGroups.get(key) ?? {
        id: key,
        sessionId: row.sessionId,
        distributorId: row.distributorId,
        verifiedAt: row.verifiedAt,
        items: []
      };
      current.verifiedAt = Math.max(current.verifiedAt ?? 0, row.verifiedAt ?? 0) || undefined;
      current.items.push({
        productId: row.productId,
        expectedQty: row.expectedQty,
        receivedQty: row.receivedQty,
        status: row.status
      });
      verificationGroups.set(key, current);
    });

    return {
      products: snapshotProducts,
      distributors: snapshotDistributors,
      sessions: snapshotSessions,
      registerItems: snapshotRegisterItems,
      purchaseHistory: snapshotPurchaseHistory,
      enquiryHistory: snapshotEnquiryHistory,
      bills: snapshotBills,
      gatePasses: snapshotGatePasses,
      stockLog: snapshotStockLog,
      deliveryVerifications: Array.from(verificationGroups.values())
    };
  }
});
