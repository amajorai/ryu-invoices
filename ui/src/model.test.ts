import { describe, expect, it } from "bun:test";
import {
	demoState,
	formatMoney,
	invoiceStats,
	normalizeState,
	patchInvoice,
} from "./model.ts";

describe("invoices model", () => {
	it("drops invalid invoice rows and normalizes currency", () => {
		const state = normalizeState({
			invoices: [
				{ client: "Acme", currency: "usd", number: "INV-1", amountMinor: 1200 },
				{ client: "", number: "INV-2" },
			],
		});

		expect(state.invoices).toHaveLength(1);
		expect(state.invoices[0]?.currency).toBe("USD");
	});

	it("summarizes due, overdue, and collected totals", () => {
		expect(invoiceStats(demoState().invoices)).toEqual({
			collectedMinor: 320_000,
			dueMinor: 690_000,
			overdueMinor: 210_000,
		});
	});

	it("updates one invoice and formats a locale-aware amount", () => {
		const state = demoState();
		const invoice = state.invoices[0];
		if (!invoice) {
			return;
		}
		const updated = patchInvoice(state, invoice.id, { status: "paid" });
		expect(updated.invoices[0]?.status).toBe("paid");
		expect(formatMoney(480_000, "USD")).toContain("4,800");
	});
});
