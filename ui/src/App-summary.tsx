import { useLiteralMessages } from "@ryu/i18n/react";
import { formatMoney, type InvoiceCurrencyTotals } from "./model.ts";

export function InvoicesOverview({
	stats,
}: {
	stats: InvoiceCurrencyTotals[];
}) {
	const tl = useLiteralMessages();
	return (
		<div className="invoices-overview">
			<div>
				<h2>Accounts receivable</h2>
				<p>Track what is due without moving payment processing into Ryu.</p>
			</div>
			<div
				aria-label="Invoice summary"
				className="invoices-summary"
				role="group"
			>
				{stats.length === 0 ? (
					<span>No invoice totals yet.</span>
				) : (
					stats.map((totals) => (
						<div
							aria-label={tl("{currency} invoice totals", {
								currency: totals.currency,
							})}
							className="invoices-currency-summary"
							key={totals.currency}
							role="group"
						>
							<span>
								<strong>
									{formatMoney(totals.dueMinor, totals.currency, "code")}
								</strong>{" "}
								due
							</span>
							<span>
								<strong>
									{formatMoney(totals.overdueMinor, totals.currency, "code")}
								</strong>{" "}
								overdue
							</span>
							<span>
								<strong>
									{formatMoney(totals.collectedMinor, totals.currency, "code")}
								</strong>{" "}
								collected
							</span>
						</div>
					))
				)}
			</div>
		</div>
	);
}
