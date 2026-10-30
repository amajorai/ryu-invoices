import { afterEach, expect, test } from "bun:test";
import { loadInvoicesState, saveInvoicesState } from "./bridge.ts";
import { emptyState } from "./model.ts";

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const originalStorage = Object.getOwnPropertyDescriptor(
	globalThis,
	"localStorage"
);

afterEach(() => {
	for (const [key, descriptor] of [
		["window", originalWindow],
		["localStorage", originalStorage],
	] as const) {
		if (descriptor) {
			Object.defineProperty(globalThis, key, descriptor);
		} else {
			Reflect.deleteProperty(globalThis, key);
		}
	}
});

function host(value: string | null) {
	Object.defineProperty(globalThis, "window", {
		configurable: true,
		value: { ryu: { storage: { get: async () => value } } },
	});
}

test("missing storage is a fresh register, while unreadable storage blocks editing", async () => {
	host(null);
	expect(await loadInvoicesState()).toEqual({
		mode: "live",
		state: emptyState(),
	});
	for (const value of ["", "not-json", "null", "[]", "{}", '{"invoices":{}}']) {
		host(value);
		await expect(loadInvoicesState()).rejects.toThrow("Reload before editing");
	}
});

test("saved invoices retain their amount and status after a storage read", async () => {
	host(
		JSON.stringify({
			invoices: [
				{
					id: "i1",
					number: "INV-1",
					client: "Client",
					amountMinor: 4200,
					status: "paid",
				},
			],
		})
	);
	const loaded = await loadInvoicesState();
	expect(loaded.state.invoices[0]).toMatchObject({
		id: "i1",
		amountMinor: 4200,
		status: "paid",
	});
});

test("preview persistence failures reject instead of reporting a saved invoice", async () => {
	Object.defineProperty(globalThis, "window", {
		configurable: true,
		value: {},
	});
	Object.defineProperty(globalThis, "localStorage", {
		configurable: true,
		value: {
			setItem: () => {
				throw new Error("quota exceeded");
			},
		},
	});
	await expect(saveInvoicesState(emptyState(), "demo")).rejects.toThrow(
		"not saved"
	);
});
