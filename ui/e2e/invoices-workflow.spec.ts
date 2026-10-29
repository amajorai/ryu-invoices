import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { normalizeState } from "../src/model.ts";
import type { InvoicesState } from "../src/types.ts";

const STORAGE_KEY = "ryu.invoices.state.v1";

type InvoiceHostCall =
	| { method: "storage.get"; input: { key: string; namespace?: string } }
	| {
			method: "storage.set";
			input: { key: string; namespace: string; value: string };
	  };

function decodeStorageWrite(
	call: Extract<InvoiceHostCall, { method: "storage.set" }>
) {
	return {
		...call,
		input: {
			...call.input,
			value: normalizeState(JSON.parse(call.input.value)),
		},
	};
}

interface InvoiceHostFixture {
	calls: InvoiceHostCall[];
	failNextGet: number;
	failNextSet: number;
	holdNextSet: boolean;
	releaseHeldSet?: (accept: boolean) => void;
	stored: string;
}

declare global {
	interface Window {
		__invoicesHostFixture?: InvoiceHostFixture;
	}
}

async function screenshotPath(
	_testInfo: { outputPath(name: string): string },
	name: string
): Promise<string> {
	const configured = process.env.RYU_APPS_STORE_PROOF_DIR;
	const destination = configured
		? path.join(configured, name)
		: path.join(import.meta.dirname, "evidence", name);
	await mkdir(path.dirname(destination), { recursive: true });
	return destination;
}

async function installInvoicesHostFixture(
	page: Page,
	initialState: InvoicesState,
	failNextGet = 0
): Promise<void> {
	await page.addInitScript(
		({ initialState: seed, failNextGet: readFailures }) => {
			const fixture: InvoiceHostFixture = {
				calls: [],
				failNextGet: readFailures,
				failNextSet: 0,
				holdNextSet: false,
				stored:
					sessionStorage.getItem("invoices-host-fixture-state") ??
					JSON.stringify(seed),
			};
			Object.assign(window, {
				__invoicesHostFixture: fixture,
				ryu: {
					storage: {
						get: async (input: { key: string; namespace?: string }) => {
							fixture.calls.push({ input, method: "storage.get" });
							if (
								JSON.stringify(input) !==
								JSON.stringify({ key: "state.v1", namespace: "invoices" })
							) {
								throw new Error("Unexpected storage.get contract");
							}
							if (fixture.failNextGet > 0) {
								fixture.failNextGet -= 1;
								throw new Error("Fixture rejected storage.get");
							}
							return fixture.stored;
						},
						set: async (input: {
							key: string;
							namespace: string;
							value: string;
						}) => {
							fixture.calls.push({ input, method: "storage.set" });
							if (
								input.key !== "state.v1" ||
								input.namespace !== "invoices" ||
								Object.keys(input).sort().join(",") !== "key,namespace,value"
							) {
								throw new Error("Unexpected storage.set contract");
							}
							if (fixture.holdNextSet) {
								fixture.holdNextSet = false;
								await new Promise<void>((resolve, reject) => {
									fixture.releaseHeldSet = (accept) => {
										fixture.releaseHeldSet = undefined;
										if (accept) {
											resolve();
										} else {
											reject(new Error("Fixture rejected storage.set"));
										}
									};
								});
							}
							if (fixture.failNextSet > 0) {
								fixture.failNextSet -= 1;
								throw new Error("Fixture rejected storage.set");
							}
							fixture.stored = input.value;
							sessionStorage.setItem(
								"invoices-host-fixture-state",
								input.value
							);
						},
					},
				},
			});
		},
		{ failNextGet, initialState }
	);
}

test("creates a receivable, marks it paid, and filters the local invoice list", async ({
	page,
}, testInfo) => {
	const browserErrors: string[] = [];
	page.on("pageerror", (error) => browserErrors.push(error.message));
	await page.addInitScript((key) => localStorage.removeItem(key), STORAGE_KEY);
	await page.goto("/");
	await expect(
		page.getByRole("heading", { name: "Accounts receivable" })
	).toBeVisible();
	await page.getByRole("button", { name: "New invoice", exact: true }).click();
	const dialog = page.getByRole("dialog");
	await dialog.getByLabel("Invoice number").fill("INV-9001");
	await dialog.getByLabel("Client").fill("Acme Research");
	await dialog.getByLabel("Amount").fill("0");
	await dialog.getByRole("button", { name: "Create invoice" }).click();
	await expect(dialog.getByRole("alert")).toContainText("positive amount");

	await dialog.getByLabel("Amount").fill("1200.50");
	await dialog.getByLabel("Due date").fill("2026-10-24");
	await dialog.getByLabel("Note").fill("Quarterly research review");
	await dialog.getByRole("button", { name: "Create invoice" }).click();
	await expect(dialog).toBeHidden();
	await expect(page.getByRole("heading", { name: "INV-9001" })).toBeVisible();
	await expect(
		page.locator(".invoices-detail").getByText("Draft", { exact: true })
	).toBeVisible();

	const saved = normalizeState(
		JSON.parse(
			await page.evaluate(
				(key) => localStorage.getItem(key) ?? "null",
				STORAGE_KEY
			)
		)
	);
	expect(saved.invoices).toContainEqual(
		expect.objectContaining({
			amountMinor: 120_050,
			client: "Acme Research",
			dueDate: "2026-10-24",
			note: "Quarterly research review",
			number: "INV-9001",
			status: "draft",
		})
	);

	await page.getByLabel("Invoice status").selectOption("sent");
	await page.getByLabel("Invoice due date").fill("2026-11-02");
	await expect(page.getByLabel("Invoice due date")).toHaveValue("2026-11-02");
	await page.getByRole("button", { name: "Mark paid" }).click();
	await expect(page.locator(".invoices-detail")).toContainText("Paid");
	await expect(page.getByRole("button", { name: "Mark paid" })).toBeDisabled();
	await page.getByLabel("Invoice filter").selectOption("paid");
	const invoiceList = page.locator(".invoices-listbox");
	await expect(invoiceList).toContainText("INV-9001");
	await expect(invoiceList).toContainText("INV-1040");
	await expect(invoiceList).not.toContainText("INV-1041");
	const persisted = normalizeState(
		JSON.parse(
			await page.evaluate(
				(key) => localStorage.getItem(key) ?? "null",
				STORAGE_KEY
			)
		)
	);
	expect(persisted.invoices).toContainEqual(
		expect.objectContaining({
			dueDate: "2026-11-02",
			number: "INV-9001",
			status: "paid",
		})
	);
	await page.screenshot({
		animations: "disabled",
		fullPage: true,
		path: await screenshotPath(testInfo, "invoices-local-receivable-paid.png"),
	});
	await page.getByRole("option", { name: /INV-1040/ }).click();
	await expect(page.getByRole("heading", { name: "INV-1040" })).toBeVisible();
	expect(browserErrors).toEqual([]);
});

test("retries a refused Invoices load and creates a receivable from the empty-state action", async ({
	page,
}, testInfo) => {
	/*
	 * Retry keeps editing unavailable until invoice storage is read without mutating unread records.
	 * The empty-state Create invoice action persists a validated receivable through host storage.
	 */
	await installInvoicesHostFixture(page, { invoices: [], schemaVersion: 1 }, 3);
	await page.goto("/");
	await expect(
		page.getByText("Invoices storage unavailable", { exact: true })
	).toBeVisible();
	await expect(
		page.getByText("Fixture rejected storage.get", { exact: true })
	).toBeVisible();
	await expect(page.getByRole("button", { name: "Dismiss" })).toHaveCount(0);
	await expect(
		page.getByRole("button", { name: "New invoice", exact: true })
	).toHaveCount(0);
	const hostCalls = () =>
		page.evaluate(() => window.__invoicesHostFixture?.calls ?? []);
	expect(await hostCalls()).toEqual(
		Array.from({ length: 2 }, () => ({
			method: "storage.get",
			input: { key: "state.v1", namespace: "invoices" },
		}))
	);
	await page.getByRole("button", { name: "Retry", exact: true }).click();
	await expect(
		page.getByText("Invoices storage unavailable", { exact: true })
	).toBeVisible();
	await expect(
		page.getByText("Fixture rejected storage.get", { exact: true })
	).toBeVisible();
	await expect.poll(async () => (await hostCalls()).length).toBe(3);
	expect((await hostCalls()).map((call) => call.method)).toEqual([
		"storage.get",
		"storage.get",
		"storage.get",
	]);
	expect(await page.evaluate(() => window.__invoicesHostFixture?.stored)).toBe(
		JSON.stringify({ invoices: [], schemaVersion: 1 })
	);
	await page.getByRole("button", { name: "Retry", exact: true }).click();
	await expect(
		page.getByText("Invoices storage unavailable", { exact: true })
	).toHaveCount(0);
	await expect(
		page.getByRole("button", { name: "Retry", exact: true })
	).toHaveCount(0);
	expect(await hostCalls()).toEqual(
		Array.from({ length: 4 }, () => ({
			method: "storage.get",
			input: { key: "state.v1", namespace: "invoices" },
		}))
	);
	await expect(
		page.getByRole("heading", { name: "Start an invoice" })
	).toBeVisible();

	await page
		.locator(".invoices-detail")
		.getByRole("button", { name: "Create invoice" })
		.click();
	const dialog = page.getByRole("dialog");
	await dialog.getByLabel("Invoice number").fill("INV-1100");
	await dialog.getByLabel("Client").fill("Northstar Labs");
	await dialog.getByLabel("Amount").fill("720.25");
	await dialog.getByLabel("Due date").fill("2026-11-15");
	await dialog.getByLabel("Note").fill("Quarterly research review");
	await dialog.getByRole("button", { name: "Create invoice" }).click();
	await expect(dialog).toBeHidden();
	await expect(page.getByRole("heading", { name: "INV-1100" })).toBeVisible();

	const rawFixture = await page.evaluate(() => {
		const hostFixture = window.__invoicesHostFixture;
		if (!hostFixture) {
			throw new Error("The local Invoices storage fixture is missing.");
		}
		return {
			calls: hostFixture.calls,
			stored: hostFixture.stored,
		};
	});
	const fixture = {
		...rawFixture,
		stored: normalizeState(JSON.parse(rawFixture.stored)),
	};
	expect(
		fixture.calls.filter((call) => call.method === "storage.get")
	).toHaveLength(4);
	expect(
		fixture.calls.filter((call) => call.method === "storage.set")
	).toHaveLength(1);
	expect(fixture.stored.invoices).toContainEqual(
		expect.objectContaining({
			amountMinor: 72_025,
			client: "Northstar Labs",
			dueDate: "2026-11-15",
			note: "Quarterly research review",
			number: "INV-1100",
			status: "draft",
		})
	);
	expect(
		fixture.calls
			.filter((call) => call.method === "storage.set")
			.map((call) => call.input)
	).toEqual([
		{
			key: "state.v1",
			namespace: "invoices",
			value: JSON.stringify(fixture.stored),
		},
	]);
	await page.screenshot({
		animations: "disabled",
		fullPage: true,
		path: await screenshotPath(testInfo, "invoices-empty-state-create.png"),
	});
});

test("storage refusal preserves existing records and Retry reads them before editing", async ({
	page,
}, testInfo) => {
	const seed: InvoicesState = {
		invoices: [
			{
				id: "retained-invoice",
				number: "INV-RETAINED",
				client: "Existing account",
				amountMinor: 98_765,
				currency: "USD",
				dueDate: "2026-12-01",
				issueDate: "2026-09-01",
				note: "Must survive refusal",
				status: "sent",
			},
		],
		schemaVersion: 1,
	};
	await installInvoicesHostFixture(page, seed, 2);
	await page.goto("/");
	await expect(
		page.getByText("Invoices storage unavailable", { exact: true })
	).toBeVisible();
	await expect(
		page.getByRole("heading", { name: "INV-RETAINED", exact: true })
	).toHaveCount(0);
	expect(await page.evaluate(() => window.__invoicesHostFixture?.stored)).toBe(
		JSON.stringify(seed)
	);
	expect(
		await page.evaluate(() => window.__invoicesHostFixture?.calls)
	).toEqual(
		Array.from({ length: 2 }, () => ({
			method: "storage.get",
			input: { key: "state.v1", namespace: "invoices" },
		}))
	);
	await page.getByRole("button", { name: "Retry", exact: true }).click();
	await expect(
		page.getByRole("heading", { name: "INV-RETAINED", exact: true })
	).toBeVisible();
	await expect(page.getByLabel("Invoice due date")).toHaveValue("2026-12-01");
	expect(await page.evaluate(() => window.__invoicesHostFixture?.stored)).toBe(
		JSON.stringify(seed)
	);
	expect(
		await page.evaluate(() => window.__invoicesHostFixture?.calls)
	).toEqual(
		Array.from({ length: 3 }, () => ({
			method: "storage.get",
			input: { key: "state.v1", namespace: "invoices" },
		}))
	);
	await page.screenshot({
		animations: "disabled",
		fullPage: true,
		path: await screenshotPath(
			testInfo,
			"invoices-storage-retry-retained-record.png"
		),
	});
});

const WRITE_REFUSAL_SEED: InvoicesState = {
	schemaVersion: 1,
	invoices: [
		{
			id: "owned",
			number: "INV-WRITE",
			client: "Reviewed customer",
			amountMinor: 45_000,
			currency: "USD",
			dueDate: "2026-12-01",
			issueDate: "2026-10-01",
			note: "Keep reviewed note",
			status: "draft",
		},
		{
			id: "unrelated",
			number: "INV-OTHER",
			client: "Other customer",
			amountMinor: 99_000,
			currency: "EUR",
			dueDate: "2026-11-01",
			issueDate: "2026-09-01",
			note: "Unrelated record",
			status: "sent",
		},
	],
};

async function expectMixedCurrencySummary(
	page: Page,
	usdStatus: "draft" | "sent" | "paid"
) {
	const summary = page.getByRole("group", {
		name: "Invoice summary",
		exact: true,
	});
	await expect(summary.getByRole("group")).toHaveCount(2);
	await expect(
		summary
			.getByRole("group", { name: "EUR invoice totals", exact: true })
			.locator("span")
	).toHaveText([
		/EUR\s*990\.00\s+due/,
		/EUR\s*0\.00\s+overdue/,
		/EUR\s*0\.00\s+collected/,
	]);
	const usdDue = usdStatus === "sent" ? "450" : "0";
	const usdCollected = usdStatus === "paid" ? "450" : "0";
	await expect(
		summary
			.getByRole("group", { name: "USD invoice totals", exact: true })
			.locator("span")
	).toHaveText([
		new RegExp(`USD\\s*${usdDue}\\.00\\s+due`),
		/USD\s*0\.00\s+overdue/,
		new RegExp(`USD\\s*${usdCollected}\\.00\\s+collected`),
	]);
	await expect(summary).not.toContainText("1,440");
}

test("refused paid write restores the original invoice and explicit retry persists only its status", async ({
	page,
}, testInfo) => {
	await installInvoicesHostFixture(page, WRITE_REFUSAL_SEED);
	await page.goto("/");
	await expect(
		page.getByRole("heading", { name: "INV-WRITE", exact: true })
	).toBeVisible();
	await expectMixedCurrencySummary(page, "draft");
	await page.evaluate(() => {
		if (window.__invoicesHostFixture) {
			window.__invoicesHostFixture.failNextSet = 1;
		}
	});
	await page.getByRole("button", { name: "Mark paid", exact: true }).click();
	await expect(
		page.getByText("Changes were not saved. Fixture rejected storage.set", {
			exact: true,
		})
	).toBeVisible();
	await expect(page.getByLabel("Invoice status")).toHaveValue("draft");
	await expectMixedCurrencySummary(page, "draft");
	await expect(
		page.getByRole("button", { name: "Mark paid", exact: true })
	).toBeEnabled();
	expect(
		await page.evaluate(() =>
			JSON.parse(window.__invoicesHostFixture?.stored ?? "null")
		)
	).toEqual(WRITE_REFUSAL_SEED);
	await page.getByRole("button", { name: "Mark paid", exact: true }).click();
	await expect(page.getByLabel("Invoice status")).toHaveValue("paid");
	await expectMixedCurrencySummary(page, "paid");
	await expect(
		page.getByText("Changes were not saved. Fixture rejected storage.set", {
			exact: true,
		})
	).toHaveCount(0);
	const expected = {
		...WRITE_REFUSAL_SEED,
		invoices: WRITE_REFUSAL_SEED.invoices.map((invoice) =>
			invoice.id === "owned" ? { ...invoice, status: "paid" } : invoice
		),
	};
	const writes = await page.evaluate(() =>
		window.__invoicesHostFixture?.calls.filter(
			(call) => call.method === "storage.set"
		)
	);
	expect(writes?.map(decodeStorageWrite)).toEqual(
		[0, 1].map(() => ({
			method: "storage.set",
			input: { key: "state.v1", namespace: "invoices", value: expected },
		}))
	);
	// A retry must preserve the exact serialized payload, including all records.
	expect(writes?.[1]).toEqual(writes?.[0]);
	expect(
		await page.evaluate(() =>
			JSON.parse(window.__invoicesHostFixture?.stored ?? "null")
		)
	).toEqual(expected);
	await page.reload();
	await expect(page.getByLabel("Invoice status")).toHaveValue("paid");
	await expectMixedCurrencySummary(page, "paid");
	expect(
		await page.evaluate(() =>
			JSON.parse(window.__invoicesHostFixture?.stored ?? "null")
		)
	).toEqual(expected);
	await page.screenshot({
		animations: "disabled",
		fullPage: true,
		path: await screenshotPath(
			testInfo,
			"invoices-paid-write-refusal-retry-readback.png"
		),
	});
});

test("queued invoice writes survive an earlier refusal and reload the later acknowledged update", async ({
	page,
}, testInfo) => {
	await installInvoicesHostFixture(page, WRITE_REFUSAL_SEED);
	await page.goto("/");
	await expect(
		page.getByRole("heading", { name: "INV-WRITE", exact: true })
	).toBeVisible();
	await expectMixedCurrencySummary(page, "draft");
	await page.evaluate(() => {
		if (window.__invoicesHostFixture) {
			window.__invoicesHostFixture.holdNextSet = true;
		}
	});
	await page.getByLabel("Invoice status").selectOption("sent");
	await expect
		.poll(() =>
			page.evaluate(() => Boolean(window.__invoicesHostFixture?.releaseHeldSet))
		)
		.toBe(true);
	await page.getByLabel("Invoice due date").fill("2026-12-15");
	await expect(page.getByLabel("Invoice status")).toHaveValue("sent");
	await expectMixedCurrencySummary(page, "sent");
	expect(
		await page.evaluate(() =>
			JSON.parse(window.__invoicesHostFixture?.stored ?? "null")
		)
	).toEqual(WRITE_REFUSAL_SEED);
	expect(
		await page.evaluate(
			() =>
				window.__invoicesHostFixture?.calls.filter(
					(call) => call.method === "storage.set"
				).length
		)
	).toBe(1);
	await page.evaluate(() =>
		window.__invoicesHostFixture?.releaseHeldSet?.(false)
	);
	const first = {
		...WRITE_REFUSAL_SEED,
		invoices: WRITE_REFUSAL_SEED.invoices.map((invoice) =>
			invoice.id === "owned" ? { ...invoice, status: "sent" } : invoice
		),
	};
	const expected = {
		...first,
		invoices: first.invoices.map((invoice) =>
			invoice.id === "owned" ? { ...invoice, dueDate: "2026-12-15" } : invoice
		),
	};
	await expect
		.poll(() =>
			page.evaluate(() =>
				JSON.parse(window.__invoicesHostFixture?.stored ?? "null")
			)
		)
		.toEqual(expected);
	const writes = await page.evaluate(() =>
		window.__invoicesHostFixture?.calls.filter(
			(call) => call.method === "storage.set"
		)
	);
	expect(writes?.map(decodeStorageWrite)).toEqual(
		[first, expected].map((state) => ({
			method: "storage.set",
			input: { key: "state.v1", namespace: "invoices", value: state },
		}))
	);
	await expect(page.getByLabel("Invoice status")).toHaveValue("sent");
	await expectMixedCurrencySummary(page, "sent");
	await expect(page.getByLabel("Invoice due date")).toHaveValue("2026-12-15");
	await expect(
		page.getByText("Changes were not saved. Fixture rejected storage.set", {
			exact: true,
		})
	).toHaveCount(0);
	await page.reload();
	await expect(page.getByLabel("Invoice status")).toHaveValue("sent");
	await expectMixedCurrencySummary(page, "sent");
	await expect(page.getByLabel("Invoice due date")).toHaveValue("2026-12-15");
	expect(
		await page.evaluate(() =>
			JSON.parse(window.__invoicesHostFixture?.stored ?? "null")
		)
	).toEqual(expected);
	await page.screenshot({
		animations: "disabled",
		fullPage: true,
		path: await screenshotPath(
			testInfo,
			"invoices-queued-write-refusal-later-acknowledged.png"
		),
	});
});
