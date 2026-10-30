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
import { Textarea } from "@ryu/ui/components/textarea.tsx";
import type { Dispatch, SetStateAction, SubmitEvent } from "react";
import type { NewInvoiceForm } from "./App-model.ts";

interface NewInvoiceDialogProps {
	createNewInvoice: (event: SubmitEvent<HTMLFormElement>) => Promise<void>;
	creating: boolean;
	formError: string | null;
	newForm: NewInvoiceForm;
	newOpen: boolean;
	setFormError: Dispatch<SetStateAction<string | null>>;
	setNewForm: Dispatch<SetStateAction<NewInvoiceForm>>;
	setNewOpen: Dispatch<SetStateAction<boolean>>;
}

export function NewInvoiceDialog({
	createNewInvoice,
	creating,
	formError,
	newForm,
	newOpen,
	setFormError,
	setNewForm,
	setNewOpen,
}: NewInvoiceDialogProps) {
	return (
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
						<p aria-live="polite" className="invoices-form-error" role="alert">
							{formError}
						</p>
					) : null}
					<DialogFooter>
						<Button disabled={creating} type="submit">
							{creating ? "Saving…" : "Create invoice"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
