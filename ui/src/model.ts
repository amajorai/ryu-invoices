import { formatDate as formatDisplayDate } from "@ryu/ui/lib/timezone.ts";
import { z } from "zod";
import type { Invoice, InvoiceStatus, InvoicesState } from "./types.ts";

const normalizedTextSchema = z
	.string()
	.catch("")
	.transform((text) => text.trim());
const invoiceWireSchema = z
	.object({
		amountMinor: z
			.number()
			.catch(0)
			.transform((amount) => Math.max(0, Math.round(amount))),
		client: normalizedTextSchema.pipe(z.string().min(1)),
		currency: z
			.string()
			.catch("USD")
			.transform((currency) => currency.trim().toUpperCase() || "USD"),
		dueDate: z.string().catch(""),
		id: normalizedTextSchema,
		issueDate: z.string().catch(""),
		note: normalizedTextSchema,
		number: normalizedTextSchema.pipe(z.string().min(1)),
		status: z.enum(["draft", "sent", "paid", "overdue"]).catch("draft"),
	})
	.nullable()
	.catch(null);

export function emptyState(): InvoicesState {
	return { invoices: [], schemaVersion: 1 };
}

const invoiceStateFieldsSchema = z.object({
	invoices: z.array(invoiceWireSchema).catch([]),
});
export const invoicesStateSchema = invoiceStateFieldsSchema
	.catch({ invoices: [] })
	.transform(
		(value): InvoicesState => ({
			invoices: value.invoices
				.flatMap((invoice, index) =>
					invoice ? [{ ...invoice, id: invoice.id || `invoice-${index}` }] : []
				)
				.slice(0, 500),
			schemaVersion: 1,
		})
	);
export const normalizeState = invoicesStateSchema.parse;
export const persistedInvoicesStateSchema = z
	.object({ invoices: z.array(z.json()) })
	.transform((value) => normalizeState(value));

export function demoState(): InvoicesState {
	return normalizeState({
		invoices: [
			{
				amountMinor: 480_000,
				client: "Northstar Labs",
				currency: "USD",
				dueDate: "2026-09-10",
				id: "demo-invoice-1042",
				issueDate: "2026-08-26",
				note: "Design-partner workflow review",
				number: "INV-1042",
				status: "sent",
			},
			{
				amountMinor: 210_000,
				client: "Relay Systems",
				currency: "USD",
				dueDate: "2026-08-18",
				id: "demo-invoice-1041",
				issueDate: "2026-07-18",
				note: "Onboarding workshop",
				number: "INV-1041",
				status: "overdue",
			},
			{
				amountMinor: 320_000,
				client: "Greenline",
				currency: "USD",
				dueDate: "2026-08-12",
				id: "demo-invoice-1040",
				issueDate: "2026-07-12",
				note: "Research sprint",
				number: "INV-1040",
				status: "paid",
			},
		],
	});
}

export interface NewInvoiceInput {
	amountMinor: number;
	client: string;
	currency: string;
	dueDate: string;
	note: string;
	number: string;
}

export function createInvoice(input: NewInvoiceInput): Invoice {
	return {
		amountMinor: Math.max(0, Math.round(input.amountMinor)),
		client: input.client.trim(),
		currency: input.currency.trim().toUpperCase() || "USD",
		dueDate: input.dueDate,
		id: `invoice-${Date.now()}`,
		issueDate: new Date().toISOString().slice(0, 10),
		note: input.note.trim(),
		number: input.number.trim(),
		status: "draft",
	};
}

export function patchInvoice(
	state: InvoicesState,
	invoiceId: string,
	patch: Partial<Invoice>
): InvoicesState {
	return {
		...state,
		invoices: state.invoices.map((item) =>
			item.id === invoiceId ? { ...item, ...patch } : item
		),
	};
}

export interface InvoiceCurrencyTotals {
	collectedMinor: number;
	currency: string;
	dueMinor: number;
	overdueMinor: number;
}

export function invoiceStats(invoices: Invoice[]): InvoiceCurrencyTotals[] {
	const totals = new Map<string, InvoiceCurrencyTotals>();
	for (const invoice of invoices) {
		const currency = invoice.currency.trim().toUpperCase() || "USD";
		const group = totals.get(currency) ?? {
			currency,
			collectedMinor: 0,
			dueMinor: 0,
			overdueMinor: 0,
		};
		if (invoice.status === "paid") {
			group.collectedMinor += invoice.amountMinor;
		}
		if (invoice.status === "sent" || invoice.status === "overdue") {
			group.dueMinor += invoice.amountMinor;
		}
		if (invoice.status === "overdue") {
			group.overdueMinor += invoice.amountMinor;
		}
		totals.set(currency, group);
	}
	return [...totals.values()].sort((a, b) =>
		a.currency.localeCompare(b.currency)
	);
}

export function formatMoney(
	amountMinor: number,
	currency: string,
	currencyDisplay: "symbol" | "code" = "symbol"
): string {
	return new Intl.NumberFormat(undefined, {
		currency,
		currencyDisplay,
		style: "currency",
	}).format(amountMinor / 100);
}

export function formatDate(value: string): string {
	if (!value) {
		return "No date";
	}
	const date = new Date(`${value}T00:00:00`);
	return Number.isNaN(date.getTime())
		? "No date"
		: formatDisplayDate(value, {
				day: "numeric",
				month: "short",
				year: "numeric",
			});
}

export function statusLabel(status: InvoiceStatus): string {
	return status.charAt(0).toUpperCase() + status.slice(1);
}
