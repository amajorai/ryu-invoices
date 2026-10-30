import type { Invoice, InvoiceStatus } from "./types.ts";

export type Filter = "all" | InvoiceStatus;

export const FILTERS: Array<{ id: Filter; label: string }> = [
	{ id: "all", label: "All" },
	{ id: "draft", label: "Drafts" },
	{ id: "sent", label: "Sent" },
	{ id: "overdue", label: "Overdue" },
	{ id: "paid", label: "Paid" },
];

export interface NewInvoiceForm {
	amount: string;
	client: string;
	currency: string;
	dueDate: string;
	note: string;
	number: string;
}

export const EMPTY_FORM: NewInvoiceForm = {
	amount: "",
	client: "",
	currency: "USD",
	dueDate: "",
	note: "",
	number: "",
};

export function errorMessage(cause: unknown): string {
	return cause instanceof Error
		? cause.message
		: "Something went wrong. Try again.";
}

export function matchesFilter(invoice: Invoice, filter: Filter): boolean {
	return filter === "all" || invoice.status === filter;
}

export function statusVariant(
	status: InvoiceStatus
): "default" | "secondary" | "destructive" | "outline" {
	if (status === "paid") {
		return "secondary";
	}
	if (status === "overdue") {
		return "destructive";
	}
	if (status === "sent") {
		return "default";
	}
	return "outline";
}

export function parseAmount(value: string): number {
	const amount = Number(value.replace(/[^0-9.]/g, ""));
	return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : 0;
}
