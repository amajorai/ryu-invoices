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
		expect(invoiceStats(demoState().invoices)).toEqual([
			{
				currency: "USD",
				collectedMinor: 320_000,
				dueMinor: 690_000,
				overdueMinor: 210_000,
			},
		]);
	});

	it("updates one invoice and formats a locale-aware amount", () => {
		const state = demoState();
		const invoice = state.invoices[0];
		if (!invoice) {
			throw new Error("Expected invoices fixture to contain invoice");
		}
		const updated = patchInvoice(state, invoice.id, { status: "paid" });
		expect(updated.invoices[0]?.status).toBe("paid");
		expect(formatMoney(480_000, "USD")).toContain("4,800");
	});
	it("keeps due overdue and paid amounts separate by canonical currency", () => {
		const base = demoState().invoices[0];
		if (!base) {
			throw new Error("Missing invoice fixture");
		}
		const invoices = [
			{
				...base,
				id: "usd-due",
				currency: "usd",
				status: "sent" as const,
				amountMinor: 45_000,
			},
			{
				...base,
				id: "eur-due",
				currency: " EUR ",
				status: "sent" as const,
				amountMinor: 99_000,
			},
			{
				...base,
				id: "eur-overdue",
				currency: "EUR",
				status: "overdue" as const,
				amountMinor: 10_000,
			},
			{
				...base,
				id: "usd-paid",
				currency: "USD",
				status: "paid" as const,
				amountMinor: 20_000,
			},
			{
				...base,
				id: "eur-paid",
				currency: "EUR",
				status: "paid" as const,
				amountMinor: 30_000,
			},
			{
				...base,
				id: "draft",
				currency: "USD",
				status: "draft" as const,
				amountMinor: 900_000,
			},
		];
		expect(invoiceStats(invoices)).toEqual([
			{
				currency: "EUR",
				dueMinor: 109_000,
				overdueMinor: 10_000,
				collectedMinor: 30_000,
			},
			{
				currency: "USD",
				dueMinor: 45_000,
				overdueMinor: 0,
				collectedMinor: 20_000,
			},
		]);
		expect(invoiceStats([...invoices].reverse())).toEqual(
			invoiceStats(invoices)
		);
		expect(invoiceStats([])).toEqual([]);
		expect(formatMoney(45_000, "USD", "code")).toContain("USD");
	});
});

it("preserves legacy invoice fallback values, cents rounding, and original indices", () => {
	const state = normalizeState({
		invoices: [
			null,
			{
				number: " INV-7 ",
				client: " Acme ",
				id: " ",
				amountMinor: 1234.5,
				currency: " eur ",
				status: "legacy",
				dueDate: false,
				issueDate: 7,
				note: " note ",
			},
			{
				number: "INV-8",
				client: "Acme",
				amountMinor: Number.POSITIVE_INFINITY,
			},
			{ number: "INV-9", client: "Acme", amountMinor: -12 },
			{ number: " ", client: "Acme" },
		],
	});
	expect(state.invoices[0]).toEqual({
		amountMinor: 1235,
		client: "Acme",
		currency: "EUR",
		dueDate: "",
		id: "invoice-1",
		issueDate: "",
		note: "note",
		number: "INV-7",
		status: "draft",
	});
	expect(state.invoices).toHaveLength(3);
	expect(state.invoices[1]?.amountMinor).toBe(0);
	expect(state.invoices[2]?.amountMinor).toBe(0);
	expect(normalizeState(null)).toEqual({ invoices: [], schemaVersion: 1 });
});
