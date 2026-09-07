import { Add01Icon, CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	RyuAppActions,
	RyuAppDetail,
	RyuAppEmpty,
	RyuAppField,
	RyuAppList,
	RyuAppListItem,
	RyuAppMain,
	RyuAppSection,
	RyuAppToolbar,
} from "@ryu/blocks/companion/app-ui";
import { Badge } from "@ryu/ui/components/badge.tsx";
import { Button } from "@ryu/ui/components/button.tsx";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@ryu/ui/components/dialog.tsx";
import { Input } from "@ryu/ui/components/input.tsx";
import { Label } from "@ryu/ui/components/label.tsx";
import {
	NativeSelect,
	NativeSelectOption,
} from "@ryu/ui/components/native-select.tsx";
import { Textarea } from "@ryu/ui/components/textarea.tsx";
import {
	type FormEvent,
	useCallback,
	useEffect,
	useMemo,
	useState,
} from "react";
import {
	type AppMode,
	loadInvoicesState,
	notify,
	saveInvoicesState,
} from "./bridge.ts";
import {
	createInvoice,
	formatDate,
	formatMoney,
	invoiceStats,
	normalizeState,
	patchInvoice,
	statusLabel,
} from "./model.ts";
import type { Invoice, InvoiceStatus, InvoicesState } from "./types.ts";

type Filter = "all" | InvoiceStatus;

const FILTERS: Array<{ id: Filter; label: string }> = [
	{ id: "all", label: "All" },
	{ id: "draft", label: "Drafts" },
	{ id: "sent", label: "Sent" },
	{ id: "overdue", label: "Overdue" },
	{ id: "paid", label: "Paid" },
];

interface NewInvoiceForm {
	amount: string;
	client: string;
	currency: string;
	dueDate: string;
	note: string;
	number: string;
}

const EMPTY_FORM: NewInvoiceForm = {
	amount: "",
	client: "",
	currency: "USD",
	dueDate: "",
	note: "",
	number: "",
};

function errorMessage(cause: unknown): string {
	return cause instanceof Error
		? cause.message
		: "Something went wrong. Try again.";
}

function matchesFilter(invoice: Invoice, filter: Filter): boolean {
	return filter === "all" || invoice.status === filter;
}

function statusVariant(
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

function parseAmount(value: string): number {
	const amount = Number(value.replace(/[^0-9.]/g, ""));
	return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : 0;
}

export function App() {
	const [state, setState] = useState<InvoicesState | null>(null);
	const [mode, setMode] = useState<AppMode>("demo");
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [filter, setFilter] = useState<Filter>("all");
	const [newOpen, setNewOpen] = useState(false);
	const [newForm, setNewForm] = useState<NewInvoiceForm>(EMPTY_FORM);
	const [formError, setFormError] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);

	const invoice = useMemo(
		() =>
			state?.invoices.find((item) => item.id === selectedId) ??
			state?.invoices[0] ??
			null,
		[state, selectedId]
	);
	const visibleInvoices = useMemo(
		() => state?.invoices.filter((item) => matchesFilter(item, filter)) ?? [],
		[state, filter]
	);
	const stats = useMemo(() => invoiceStats(state?.invoices ?? []), [state]);

	const commit = useCallback(
		(next: InvoicesState) => {
			setState(next);
			void saveInvoicesState(next, mode).catch((cause) =>
				setError(errorMessage(cause))
			);
		},
		[mode]
	);

	const load = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const loaded = await loadInvoicesState();
			setMode(loaded.mode);
			setState(loaded.state);
			setSelectedId(loaded.state.invoices[0]?.id ?? null);
		} catch (cause) {
			setError(errorMessage(cause));
			setState(normalizeState(null));
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	function updateSelectedInvoice(patch: Partial<Invoice>) {
		if (!(state && invoice)) {
			return;
		}
		commit(patchInvoice(state, invoice.id, patch));
	}

	function createNewInvoice(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const client = newForm.client.trim();
		const number = newForm.number.trim();
		const amountMinor = parseAmount(newForm.amount);
		if (!(client && number) || amountMinor === 0) {
			setFormError("Add a client, invoice number, and positive amount.");
			return;
		}
		if (!state) {
			return;
		}
		const nextInvoice = createInvoice({
			...newForm,
			amountMinor,
			client,
			number,
		});
		commit({ ...state, invoices: [nextInvoice, ...state.invoices] });
		setSelectedId(nextInvoice.id);
		setNewOpen(false);
		setNewForm(EMPTY_FORM);
		setFormError(null);
		notify({
			title: "Invoice created",
			description: nextInvoice.number,
			variant: "success",
		});
	}

	function markPaid() {
		if (!(state && invoice) || invoice.status === "paid") {
			return;
		}
		updateSelectedInvoice({ status: "paid" });
		notify({
			title: "Invoice marked paid",
			description: invoice.number,
			variant: "success",
		});
	}

	if (loading || !state) {
		return (
			<div className="invoices-loading" role="status">
				Opening Invoices…
			</div>
		);
	}

	return (
		<div className="invoices-root">
			<RyuAppToolbar
				actions={
					<Button onClick={() => setNewOpen(true)} size="sm">
						<HugeiconsIcon aria-hidden="true" icon={Add01Icon} />
						New invoice
					</Button>
				}
				title="Invoices"
			/>
			<RyuAppMain className="invoices-main">
				{error ? (
					<div aria-live="polite" className="invoices-alert" role="alert">
						<span>{error}</span>
						<Button
							onClick={() => setError(null)}
							size="xs"
							variant="ghost-muted"
						>
							Dismiss
						</Button>
					</div>
				) : null}
				<div className="invoices-overview">
					<div>
						<h2>Accounts receivable</h2>
						<p>Track what is due without moving payment processing into Ryu.</p>
					</div>
					<div aria-label="Invoice summary" className="invoices-summary">
						<span>
							<strong>{formatMoney(stats.dueMinor, "USD")}</strong> due
						</span>
						<span>
							<strong>{formatMoney(stats.overdueMinor, "USD")}</strong> overdue
						</span>
						<span>
							<strong>{formatMoney(stats.collectedMinor, "USD")}</strong>{" "}
							collected
						</span>
					</div>
				</div>

				<div className="invoices-layout">
					<RyuAppSection
						className="invoices-panel invoices-list"
						title="Invoices"
					>
						<div className="invoices-filters">
							<NativeSelect
								aria-label="Invoice filter"
								onChange={(event) => setFilter(event.target.value as Filter)}
								value={filter}
							>
								{FILTERS.map((item) => (
									<NativeSelectOption key={item.id} value={item.id}>
										{item.id === "all" ? "All invoices" : item.label}
									</NativeSelectOption>
								))}
							</NativeSelect>
						</div>
						{visibleInvoices.length > 0 ? (
							<RyuAppList
								aria-label="Saved invoices"
								className="invoices-listbox"
							>
								{visibleInvoices.map((item) => (
									<RyuAppListItem
										accessories={
											<Badge variant={statusVariant(item.status)}>
												{statusLabel(item.status)}
											</Badge>
										}
										key={item.id}
										onClick={() => setSelectedId(item.id)}
										selected={invoice?.id === item.id}
										subtitle={`${item.client} · ${formatMoney(item.amountMinor, item.currency)}`}
										title={item.number}
									/>
								))}
							</RyuAppList>
						) : (
							<RyuAppEmpty
								description="Create an invoice when you need to track a new receivable."
								title="No invoices here"
							/>
						)}
					</RyuAppSection>

					{invoice ? (
						<RyuAppSection className="invoices-panel invoices-detail">
							<div className="invoices-detail-heading">
								<div>
									<p className="invoices-label">Invoice</p>
									<h2>{invoice.number}</h2>
									<p className="invoices-muted">{invoice.client}</p>
								</div>
								<Badge variant={statusVariant(invoice.status)}>
									{statusLabel(invoice.status)}
								</Badge>
							</div>
							<div className="invoices-amount">
								<p className="invoices-label">Amount</p>
								<strong>
									{formatMoney(invoice.amountMinor, invoice.currency)}
								</strong>
							</div>
							<div className="invoices-detail-meta">
								<div>
									<p className="invoices-label">Issued</p>
									<strong>{formatDate(invoice.issueDate)}</strong>
								</div>
								<div>
									<p className="invoices-label">Due</p>
									<strong>{formatDate(invoice.dueDate)}</strong>
								</div>
							</div>
							<div className="invoices-note">
								<p className="invoices-label">Note</p>
								<p>{invoice.note || "No note attached."}</p>
							</div>
						</RyuAppSection>
					) : (
						<RyuAppSection className="invoices-panel invoices-detail">
							<RyuAppEmpty
								actions={
									<Button onClick={() => setNewOpen(true)}>
										<HugeiconsIcon aria-hidden="true" icon={Add01Icon} />
										Create invoice
									</Button>
								}
								description="Track the amount, due date, and status in one place."
								title="Start an invoice"
							/>
						</RyuAppSection>
					)}

					{invoice ? (
						<RyuAppDetail className="invoices-panel invoices-inspector">
							<div className="invoices-inspector-heading">
								<p className="invoices-label">Invoice controls</p>
								<h2>Keep the record current.</h2>
								<p className="invoices-muted">
									Status is local bookkeeping. Payments stay with your existing
									provider.
								</p>
							</div>
							<div className="invoices-inspector-block">
								<RyuAppField label="Status">
									<NativeSelect
										aria-label="Invoice status"
										onChange={(event) =>
											updateSelectedInvoice({
												status: event.target.value as InvoiceStatus,
											})
										}
										value={invoice.status}
									>
										{(
											["draft", "sent", "paid", "overdue"] as InvoiceStatus[]
										).map((status) => (
											<NativeSelectOption key={status} value={status}>
												{statusLabel(status)}
											</NativeSelectOption>
										))}
									</NativeSelect>
								</RyuAppField>
								<RyuAppField label="Due date">
									<Input
										aria-label="Invoice due date"
										name="invoice-due-date"
										onChange={(event) =>
											updateSelectedInvoice({ dueDate: event.target.value })
										}
										type="date"
										value={invoice.dueDate}
									/>
								</RyuAppField>
							</div>
							<RyuAppActions className="invoices-inspector-actions">
								<Button
									disabled={invoice.status === "paid"}
									onClick={markPaid}
									size="sm"
									variant="secondary"
								>
									<HugeiconsIcon
										aria-hidden="true"
										icon={CheckmarkCircle02Icon}
									/>
									Mark paid
								</Button>
								<Badge variant="outline">
									{mode === "demo" ? "Preview data" : "Node-owned data"}
								</Badge>
							</RyuAppActions>
						</RyuAppDetail>
					) : null}
				</div>
			</RyuAppMain>

			<Dialog
				onOpenChange={(open) => {
					setNewOpen(open);
					if (!open) {
						setFormError(null);
					}
				}}
				open={newOpen}
			>
				<DialogContent className="sm:max-w-lg">
					<DialogHeader>
						<DialogTitle>New invoice</DialogTitle>
						<DialogDescription>
							Create a local receivable record. Payment processing stays outside
							Ryu.
						</DialogDescription>
					</DialogHeader>
					<form className="invoices-form" onSubmit={createNewInvoice}>
						<div className="invoices-form-fields">
							<div>
								<Label htmlFor="new-invoice-number">Invoice number</Label>
								<Input
									autoComplete="off"
									id="new-invoice-number"
									name="new-invoice-number"
									onChange={(event) =>
										setNewForm((current) => ({
											...current,
											number: event.target.value,
										}))
									}
									placeholder="e.g. INV-1043…"
									value={newForm.number}
								/>
							</div>
							<div>
								<Label htmlFor="new-invoice-client">Client</Label>
								<Input
									autoComplete="off"
									id="new-invoice-client"
									name="new-invoice-client"
									onChange={(event) =>
										setNewForm((current) => ({
											...current,
											client: event.target.value,
										}))
									}
									placeholder="e.g. Northstar Labs…"
									value={newForm.client}
								/>
							</div>
							<div>
								<Label htmlFor="new-invoice-amount">Amount</Label>
								<Input
									id="new-invoice-amount"
									inputMode="decimal"
									name="new-invoice-amount"
									onChange={(event) =>
										setNewForm((current) => ({
											...current,
											amount: event.target.value,
										}))
									}
									placeholder="e.g. 2400…"
									type="number"
									value={newForm.amount}
								/>
							</div>
							<div>
								<Label htmlFor="new-invoice-due-date">Due date</Label>
								<Input
									id="new-invoice-due-date"
									name="new-invoice-due-date"
									onChange={(event) =>
										setNewForm((current) => ({
											...current,
											dueDate: event.target.value,
										}))
									}
									type="date"
									value={newForm.dueDate}
								/>
							</div>
							<div className="invoices-form-wide">
								<Label htmlFor="new-invoice-note">Note</Label>
								<Textarea
									autoComplete="off"
									id="new-invoice-note"
									name="new-invoice-note"
									onChange={(event) =>
										setNewForm((current) => ({
											...current,
											note: event.target.value,
										}))
									}
									placeholder="What is this invoice for?…"
									value={newForm.note}
								/>
							</div>
						</div>
						{formError ? (
							<p
								aria-live="polite"
								className="invoices-form-error"
								role="alert"
							>
								{formError}
							</p>
						) : null}
						<DialogFooter>
							<Button type="submit">Create invoice</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>
		</div>
	);
}
