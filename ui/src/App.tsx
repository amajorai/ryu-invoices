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
import { useLiteralMessages } from "@ryu/i18n/react";
import { Badge } from "@ryu/ui/components/badge.tsx";
import { Button } from "@ryu/ui/components/button.tsx";
import { Input } from "@ryu/ui/components/input.tsx";
import {
	NativeSelect,
	NativeSelectOption,
} from "@ryu/ui/components/native-select.tsx";
import {
	type SubmitEvent,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	EMPTY_FORM,
	errorMessage,
	FILTERS,
	type Filter,
	matchesFilter,
	type NewInvoiceForm,
	parseAmount,
	statusVariant,
} from "./App-model.ts";
import { NewInvoiceDialog } from "./App-new-invoice-dialog.tsx";
import { InvoicesOverview } from "./App-summary.tsx";
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
	patchInvoice,
	statusLabel,
} from "./model.ts";
import type { Invoice, InvoiceStatus, InvoicesState } from "./types.ts";

export function App() {
	const tl = useLiteralMessages();
	const [state, setState] = useState<InvoicesState | null>(null);
	const [mode, setMode] = useState<AppMode>(() =>
		window.ryu ? "live" : "demo"
	);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [filter, setFilter] = useState<Filter>("all");
	const [newOpen, setNewOpen] = useState(false);
	const [newForm, setNewForm] = useState<NewInvoiceForm>(EMPTY_FORM);
	const [formError, setFormError] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [creating, setCreating] = useState(false);
	const saveQueue = useRef(Promise.resolve());
	const savedState = useRef<InvoicesState | null>(null);

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
			const save = saveQueue.current.then(() => saveInvoicesState(next, mode));
			saveQueue.current = save.catch(() => undefined);
			return save.then(
				() => {
					savedState.current = next;
					setError(null);
					return true;
				},
				(cause: unknown) => {
					setError(
						tl("Changes were not saved. {message}", {
							message: errorMessage(cause),
						})
					);
					setState((current) =>
						current === next ? savedState.current : current
					);
					return false;
				}
			);
		},
		[mode, tl]
	);

	const load = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const loaded = await loadInvoicesState();
			setMode(loaded.mode);
			setState(loaded.state);
			savedState.current = loaded.state;
			setSelectedId(loaded.state.invoices[0]?.id ?? null);
		} catch (cause) {
			setError(errorMessage(cause));
			setState(null);
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

	async function createNewInvoice(event: SubmitEvent<HTMLFormElement>) {
		event.preventDefault();
		if (creating) {
			return;
		}
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
		setCreating(true);
		const saved = await commit({
			...state,
			invoices: [nextInvoice, ...state.invoices],
		});
		setCreating(false);
		if (!saved) {
			setFormError("The invoice was not saved. Try again.");
			return;
		}
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

	async function markPaid() {
		if (!(state && invoice) || invoice.status === "paid") {
			return;
		}
		if (!(await commit(patchInvoice(state, invoice.id, { status: "paid" })))) {
			return;
		}
		notify({
			title: "Invoice marked paid",
			description: invoice.number,
			variant: "success",
		});
	}

	if (loading) {
		return (
			<div className="invoices-loading" role="status">
				Opening Invoices…
			</div>
		);
	}
	if (!state) {
		return (
			<RyuAppMain>
				<RyuAppEmpty
					actions={<Button onClick={() => void load()}>Retry</Button>}
					description={error ?? "Invoice data could not be loaded."}
					title="Invoices storage unavailable"
				/>
			</RyuAppMain>
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
				<InvoicesOverview stats={stats} />

				<div className="invoices-layout">
					<RyuAppSection
						className="invoices-panel invoices-list"
						title="Invoices"
					>
						<div className="invoices-filters">
							<NativeSelect
								aria-label="Invoice filter"
								onChange={(event) =>
									setFilter(
										/* SAFETY: The rendered select options use only values from this domain union. */ event
											.target.value as Filter
									)
								}
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
								<h2>Invoice controls</h2>
								<p className="invoices-muted">
									Update local status and details. Payments stay with your
									existing provider.
								</p>
							</div>
							<div className="invoices-inspector-block">
								<RyuAppField label="Status">
									<NativeSelect
										aria-label="Invoice status"
										onChange={(event) =>
											updateSelectedInvoice({
												status:
													/* SAFETY: The rendered select options use only values from this domain union. */ event
														.target.value as InvoiceStatus,
											})
										}
										value={invoice.status}
									>
										{(
											[
												"draft",
												"sent",
												"paid",
												"overdue",
											] satisfies InvoiceStatus[]
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

			<NewInvoiceDialog
				createNewInvoice={createNewInvoice}
				creating={creating}
				formError={formError}
				newForm={newForm}
				newOpen={newOpen}
				setFormError={setFormError}
				setNewForm={setNewForm}
				setNewOpen={setNewOpen}
			/>
		</div>
	);
}
