import type { Invoice, InvoiceStatus, InvoicesState } from "./types.ts";

const INVOICE_STATUSES: InvoiceStatus[] = ["draft", "sent", "paid", "overdue"];

function record(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown, fallback = ""): string {
	return typeof value === "string" ? value : fallback;
}

function invoiceStatus(value: unknown): InvoiceStatus {
	return typeof value === "string" &&
		INVOICE_STATUSES.includes(value as InvoiceStatus)
		? (value as InvoiceStatus)
		: "draft";
}

function invoice(value: unknown, index: number): Invoice | null {
	if (!record(value)) {
		return null;
	}
	const number = stringValue(value.number).trim();
	const client = stringValue(value.client).trim();
	if (!(number && client)) {
		return null;
	}
	const amountMinor =
		typeof value.amountMinor === "number" && Number.isFinite(value.amountMinor)
			? Math.max(0, Math.round(value.amountMinor))
			: 0;
	return {
		amountMinor,
		client,
		currency: stringValue(value.currency, "USD").trim().toUpperCase() || "USD",
		dueDate: stringValue(value.dueDate),
		id: stringValue(value.id, `invoice-${index}`).trim() || `invoice-${index}`,
		issueDate: stringValue(value.issueDate),
		note: stringValue(value.note).trim(),
		number,
		status: invoiceStatus(value.status),
	};
}

export function emptyState(): InvoicesState {
	return { invoices: [], schemaVersion: 1 };
}

export function normalizeState(value: unknown): InvoicesState {
	if (!record(value)) {
		return emptyState();
	}
	const rawInvoices = Array.isArray(value.invoices) ? value.invoices : [];
	return {
		invoices: rawInvoices
			.map((item, index) => invoice(item, index))
			.filter((item): item is Invoice => item !== null)
			.slice(0, 500),
		schemaVersion: 1,
	};
}

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

export function invoiceStats(invoices: Invoice[]): {
	collectedMinor: number;
	dueMinor: number;
	overdueMinor: number;
} {
	return {
		collectedMinor: invoices
			.filter((item) => item.status === "paid")
			.reduce((sum, item) => sum + item.amountMinor, 0),
		dueMinor: invoices
			.filter((item) => item.status === "sent" || item.status === "overdue")
			.reduce((sum, item) => sum + item.amountMinor, 0),
		overdueMinor: invoices
			.filter((item) => item.status === "overdue")
			.reduce((sum, item) => sum + item.amountMinor, 0),
	};
}

export function formatMoney(amountMinor: number, currency: string): string {
	return new Intl.NumberFormat(undefined, {
		currency,
		currencyDisplay: "symbol",
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
		: new Intl.DateTimeFormat(undefined, {
				day: "numeric",
				month: "short",
				year: "numeric",
			}).format(date);
}

export function statusLabel(status: InvoiceStatus): string {
	return status.charAt(0).toUpperCase() + status.slice(1);
}
