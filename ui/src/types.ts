export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue";

export interface Invoice {
	amountMinor: number;
	client: string;
	currency: string;
	dueDate: string;
	id: string;
	issueDate: string;
	note: string;
	number: string;
	status: InvoiceStatus;
}

export interface InvoicesState {
	invoices: Invoice[];
	schemaVersion: 1;
}
