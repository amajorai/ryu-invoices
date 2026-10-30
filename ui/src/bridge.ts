import {
	demoState,
	emptyState,
	normalizeState,
	persistedInvoicesStateSchema,
} from "./model.ts";
import type { InvoicesState } from "./types.ts";

const STORAGE_NAMESPACE = "invoices";
const STORAGE_KEY = "state.v1";
const LOCAL_STORAGE_KEY = "ryu.invoices.state.v1";

interface RyuStorage {
	get(input: { key: string; namespace?: string }): Promise<string | null>;
	set(input: { key: string; namespace?: string; value: string }): Promise<void>;
}

interface RyuToast {
	show(input: {
		description?: string;
		title: string;
		variant?: "default" | "success" | "error" | "info";
	}): Promise<string>;
}

interface RyuBridge {
	storage?: RyuStorage;
	ui?: { toast?: RyuToast };
}

declare global {
	interface Window {
		ryu?: RyuBridge;
	}
}

export type AppMode = "demo" | "live";

function bridge(): RyuBridge | null {
	return globalThis.window?.ryu ?? null;
}

function parse(value: string | null): InvoicesState {
	if (!value) {
		return emptyState();
	}
	try {
		return normalizeState(JSON.parse(value));
	} catch {
		return emptyState();
	}
}

function localGet(): string | null {
	try {
		return globalThis.localStorage.getItem(LOCAL_STORAGE_KEY);
	} catch {
		return null;
	}
}

function localSet(value: string): void {
	try {
		globalThis.localStorage.setItem(LOCAL_STORAGE_KEY, value);
	} catch {
		throw new Error(
			"Preview storage is unavailable. The change was not saved."
		);
	}
}

export async function loadInvoicesState(): Promise<{
	mode: AppMode;
	state: InvoicesState;
}> {
	const current = bridge();
	if (!current) {
		const local = localGet();
		return { mode: "demo", state: local ? parse(local) : demoState() };
	}
	if (!current.storage) {
		throw new Error("Invoices storage is unavailable. Reload before editing.");
	}
	const stored = await current.storage.get({
		key: STORAGE_KEY,
		namespace: STORAGE_NAMESPACE,
	});
	if (stored === null) {
		return { mode: "live", state: emptyState() };
	}
	try {
		return {
			mode: "live",
			state: persistedInvoicesStateSchema.parse(JSON.parse(stored)),
		};
	} catch {
		throw new Error("Invoice data could not be read. Reload before editing.");
	}
}

export async function saveInvoicesState(
	state: InvoicesState,
	mode: AppMode
): Promise<void> {
	const value = JSON.stringify(state);
	if (mode === "demo") {
		if (bridge()) {
			throw new Error(
				"Preview state cannot be saved to a connected host. Reload the app."
			);
		}
		localSet(value);
		return;
	}
	const current = bridge();
	if (!current?.storage) {
		throw new Error("Invoices storage is not available for this app.");
	}
	await current.storage.set({
		key: STORAGE_KEY,
		namespace: STORAGE_NAMESPACE,
		value,
	});
}

export function notify(input: {
	description?: string;
	title: string;
	variant?: "default" | "success" | "error" | "info";
}): void {
	const show = bridge()?.ui?.toast?.show;
	if (!show) {
		return;
	}
	try {
		void show(input).catch(() => undefined);
	} catch {
		// A toast should never block an invoice edit.
	}
}
