import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { Bill, Distributor, GatePass, Product, Session } from "../types";

function money(value: number) {
  return `Rs ${value.toLocaleString("en-IN")}`;
}

function productName(products: Product[], id: string) {
  return products.find((product) => product.id === id)?.name ?? "Item";
}

export function exportGatePassPdf(input: {
  gatePass: GatePass;
  bill: Bill;
  session: Session;
  distributor: Distributor;
  products: Product[];
}) {
  const { gatePass, bill, session, distributor, products } = input;
  const doc = new jsPDF();

  doc.setFontSize(18);
  doc.text("GATE PASS", 14, 18);
  doc.setFontSize(11);
  doc.text(`Distributor: ${distributor.name}`, 14, 28);
  doc.text(`Bill: ${bill.billNumber} | Date: ${bill.billDate} | Session: ${session.name}`, 14, 35);

  autoTable(doc, {
    startY: 42,
    head: [["Bag", "Contents"]],
    body: gatePass.bags.map((bag) => [
      String(bag.bagNumber),
      bag.items.map((item) => `${productName(products, item.productId)} x ${item.unitsInBag}`).join(" + ")
    ])
  });

  autoTable(doc, {
    startY: (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY
      ? ((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 0) + 10
      : 100,
    head: [["Item", "Units", "Total", "Rate/kg"]],
    body: bill.items.map((item) => [
      productName(products, item.productId),
      `${item.unitsBought} ${products.find((product) => product.id === item.productId)?.unitLabel ?? "units"}`,
      money(item.totalPrice),
      `${money(item.ratePerKg)}/kg`
    ])
  });

  const lastY =
    (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 180;
  doc.text(
    `Courier fee: ${gatePass.bags.length} bags x ${money(gatePass.courierFeePerBag ?? 0)} = ${money(gatePass.courierFeeTotal)}`,
    14,
    lastY + 12
  );

  doc.save(`${distributor.shortCode}-${bill.billNumber}-gate-pass.pdf`);
}

export function exportSessionSummaryPdf(input: {
  session: Session;
  gatePasses: GatePass[];
  bills: Bill[];
  distributors: Distributor[];
}) {
  const { session, gatePasses, bills, distributors } = input;
  const doc = new jsPDF();
  const totalBags = gatePasses.reduce((sum, gatePass) => sum + gatePass.bags.length, 0);
  const totalSpend = bills.reduce((sum, bill) => sum + bill.totalAmount, 0);
  const totalCourier = gatePasses.reduce((sum, gatePass) => sum + gatePass.courierFeeTotal, 0);

  doc.setFontSize(18);
  doc.text("SESSION SUMMARY", 14, 18);
  doc.setFontSize(11);
  doc.text(`${session.name} | ${session.date}`, 14, 28);
  doc.text(`Total bags: ${totalBags}`, 14, 35);
  doc.text(`Total spend: ${money(totalSpend)} | Courier: ${money(totalCourier)}`, 14, 42);

  autoTable(doc, {
    startY: 50,
    head: [["Distributor", "Bill", "Bags", "Courier", "Total"]],
    body: gatePasses.map((gatePass) => {
      const distributor = distributors.find((item) => item.id === gatePass.distributorId);
      const bill = bills.find((item) => item.id === gatePass.billId);
      return [
        distributor?.name ?? "Distributor",
        bill?.billNumber ?? "-",
        String(gatePass.bags.length),
        money(gatePass.courierFeeTotal),
        money(bill?.totalAmount ?? 0)
      ];
    })
  });

  doc.save(`${session.name.replace(/\s+/g, "-").toLowerCase()}-summary.pdf`);
}

export function exportPurchasedItemsPdf(input: {
  session: Session;
  bills: Bill[];
  distributors: Distributor[];
  products: Product[];
}) {
  const { session, bills, distributors, products } = input;
  const doc = new jsPDF();

  doc.setFontSize(18);
  doc.text("PURCHASED ITEMS", 14, 18);
  doc.setFontSize(11);
  doc.text(`${session.name} | ${session.date}`, 14, 28);

  autoTable(doc, {
    startY: 36,
    head: [["Item", "Distributor", "Qty", "Rate/unit", "Rate/kg/box", "Total"]],
    body: bills.flatMap((bill) =>
      bill.items.map((item) => {
        const product = products.find((entry) => entry.id === item.productId);
        const distributor = distributors.find((entry) => entry.id === bill.distributorId);
        return [
          product?.name ?? "Item",
          distributor?.name ?? "Distributor",
          `${item.unitsBought} ${product?.unitLabel ?? "units"}`,
          money(item.ratePerUnit),
          money(item.ratePerKg),
          money(item.totalPrice)
        ];
      })
    )
  });

  doc.save(`${session.name.replace(/\s+/g, "-").toLowerCase()}-purchased-items.pdf`);
}
