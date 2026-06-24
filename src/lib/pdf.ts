import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { Bill, Distributor, GatePass, Product, Session } from "../types";

function money(value: number) {
  return `Rs ${value.toLocaleString("en-IN")}`;
}

function productName(products: Product[], id: string) {
  return products.find((product) => product.id === id)?.name ?? "Item";
}

function bagCount(gatePass: GatePass) {
  return (gatePass.smallBagCount ?? 0) + (gatePass.bigBagCount ?? 0) || gatePass.bags.length;
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
    body: gatePass.bags.length
      ? gatePass.bags.map((bag) => [
          String(bag.bagNumber),
          bag.items.map((item) => `${productName(products, item.productId)} x ${item.unitsInBag}`).join(" + ")
        ])
      : [["Summary", `Small bags: ${gatePass.smallBagCount ?? 0} · Big bags: ${gatePass.bigBagCount ?? 0}`]]
  });

  autoTable(doc, {
    startY: (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY
      ? ((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 0) + 10
      : 100,
    head: [["Item", "Units", "Total", "Rate/kg"]],
    body: bill.items.length
      ? bill.items.map((item) => [
          productName(products, item.productId),
          `${item.unitsBought} ${products.find((product) => product.id === item.productId)?.unitLabel ?? "units"}`,
          money(item.totalPrice),
          `${money(item.ratePerKg)}/kg`
        ])
      : [["Quick amount entry", "-", money(bill.totalAmount), "-"]]
  });

  const lastY =
    (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 180;
  doc.text(`Bill total: ${money(bill.totalAmount)}`, 14, lastY + 12);
  doc.text(
    `Courier fee: ${bagCount(gatePass)} bags = ${money(gatePass.courierFeeTotal)}`,
    14,
    lastY + 20
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
  const orderedBills = [...bills].sort(
    (a, b) => a.billDate.localeCompare(b.billDate) || a.billNumber.localeCompare(b.billNumber)
  );
  const totalBags = gatePasses.reduce((sum, gatePass) => sum + bagCount(gatePass), 0);
  const totalSpend = bills.reduce((sum, bill) => sum + bill.totalAmount, 0);
  const totalCourier = gatePasses.reduce((sum, gatePass) => sum + gatePass.courierFeeTotal, 0);
  const totalSmallBags = gatePasses.reduce((sum, gatePass) => sum + (gatePass.smallBagCount ?? 0), 0);
  const totalBigBags = gatePasses.reduce((sum, gatePass) => sum + (gatePass.bigBagCount ?? 0), 0);

  doc.setFontSize(18);
  doc.text("SESSION SUMMARY", 14, 18);
  doc.setFontSize(11);
  doc.text(`${session.name} | ${session.date}`, 14, 28);
  doc.text(`Bills: ${bills.length} | Total bags: ${totalBags}`, 14, 35);
  doc.text(`Small bags: ${totalSmallBags} | Big bags: ${totalBigBags}`, 14, 42);
  doc.text(`Total spend: ${money(totalSpend)} | Courier: ${money(totalCourier)}`, 14, 49);

  autoTable(doc, {
    startY: 57,
    head: [["S.No", "Bill no", "Distributor", "Amount", "Small bags", "Big bags"]],
    body: orderedBills.map((bill, index) => {
      const distributor = distributors.find((item) => item.id === bill.distributorId);
      const gatePass = gatePasses.find((item) => item.billId === bill.id);
      return [
        String(index + 1),
        bill?.billNumber ?? "-",
        distributor?.name ?? "Distributor",
        money(bill?.totalAmount ?? 0),
        String(gatePass?.smallBagCount ?? 0),
        String(gatePass?.bigBagCount ?? 0)
      ];
    })
  });

  const lastY =
    (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 160;
  doc.text(`Total amount: ${money(totalSpend)}`, 14, lastY + 12);
  doc.text(`Total small bags: ${totalSmallBags}`, 14, lastY + 20);
  doc.text(`Total big bags: ${totalBigBags}`, 14, lastY + 28);
  doc.text(`Total courier: ${money(totalCourier)}`, 14, lastY + 36);

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
