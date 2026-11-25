const speaker = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15 9a4 4 0 0 1 0 6m3-9a8 8 0 0 1 0 12"/></svg>';
const stopIcon = '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';

function* speechParts(text) {
	for (const paragraph of text.split(/\n+/)) {
		let rest = paragraph.trim();
		while (rest) {
			let end = rest.length;
			if (end > 600) {
				const head = rest.slice(0, 600);
				const sentences = [...head.matchAll(/[.!?]["')\]]*\s+/gu)];
				const last = sentences.at(-1);
				const boundary = last ? last.index + last[0].length : head.lastIndexOf(" ");
				end = boundary > 0 ? boundary : [...head].slice(0, -1).join("").length;
			}
			yield rest.slice(0, end).trim();
			rest = rest.slice(end).trimStart();
		}
	}
}

function decode(audio, base64) {
	const bytes = Uint8Array.from(atob(base64), character => character.charCodeAt(0));
	return audio.decodeAudioData(bytes.buffer);
}

function play(audio, buffer, signal) {
	signal.throwIfAborted();
	return new Promise(resolve => {
		const source = audio.createBufferSource();
		source.buffer = buffer;
		source.connect(audio.destination);
		const stop = () => source.stop();
		signal.addEventListener("abort", stop, { once: true });
		source.onended = () => {
			signal.removeEventListener("abort", stop);
			source.disconnect();
			resolve();
		};
		source.start();
	});
}

const settingsStyles = `
.pra-settings { display: flex; flex-direction: column; gap: 24px; color: var(--foreground); }
.pra-settings .pra-card { padding: 16px; border: 1px solid var(--border); border-radius: 10px; display: grid; gap: 12px; }
.pra-settings .pra-card-title { font-weight: 600; }
.pra-settings .pra-description { display: block; font-size: .85em; line-height: 1.5; color: var(--muted-foreground); overflow-wrap: anywhere; }
.pra-settings .pra-section { display: grid; gap: 20px; }
.pra-settings .pra-row { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,auto); gap: 20px; align-items: center; }
.pra-settings .pra-label { display: block; font-size: 1em; font-family: var(--font-sans, inherit); margin-bottom: 4px; }
.pra-settings .pra-control { display: flex; align-items: center; justify-content: flex-end; gap: 8px; min-width: 0; }
.pra-settings select, .pra-settings input:not([type=checkbox]):not([type=color]), .pra-settings button { border: 1px solid var(--border); border-radius: 6px; background: var(--background); color: var(--foreground); font: inherit; font-size: .85em; padding: 7px 10px; min-width: 0; max-width: 100%; }
.pra-settings select { width: 100%; }
.pra-settings button { cursor: pointer; white-space: nowrap; }
.pra-settings button:hover { background: var(--accent); }
.pra-settings button:disabled { opacity: .5; cursor: default; }
.pra-settings .pra-switch { appearance: none; display: block; position: relative; width: 32px; height: 18px; flex: none; border-radius: 99px; background: var(--muted, #555); border: 1px solid var(--border); cursor: pointer; }
.pra-settings .pra-switch::after { content: ""; position: absolute; top: 2px; left: 2px; width: 12px; height: 12px; border-radius: 50%; background: var(--muted-foreground); transition: transform .15s; }
.pra-settings .pra-switch:checked { background: var(--primary); }
.pra-settings .pra-switch:checked::after { transform: translateX(14px); background: var(--primary-foreground); }
.pra-settings :focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }
.pra-settings input[type=color] { width: 36px; height: 28px; border: 1px solid var(--border); border-radius: 5px; padding: 2px; background: var(--background); cursor: pointer; }
.pra-settings .pra-model { display: grid; gap: 18px; }
.pra-settings .pra-model .pra-row { grid-template-columns: minmax(0,1fr) minmax(0,1.15fr); }
.pra-settings .pra-model input { width: 100%; }
.pra-settings [hidden] { display: none !important; }
@media (max-width: 650px) { .pra-settings .pra-model .pra-row { grid-template-columns: 1fr; gap: 6px; } .pra-settings .pra-model .pra-control { justify-content: stretch; } }
`;
function settingsRow(label, description, control) {
	const row = document.createElement("label");
	row.className = "pra-row";
	const copy = document.createElement("span");
	const title = document.createElement("span");
	title.className = "pra-label";
	title.textContent = label;
	const detail = document.createElement("span");
	detail.className = "pra-description";
	detail.textContent = description;
	copy.append(title, detail);
	const right = document.createElement("span");
	right.className = "pra-control";
	right.append(control);
	row.append(copy, right);
	return row;
}

function mountSettings(ctx, container, signal, stopPlayback) {
	const card = document.createElement("div");
	card.className = "pra-card";
	const heading = document.createElement("div");
	heading.className = "pra-card-title";
	heading.textContent = "On-device speech";
	const current = document.createElement("div");
	current.className = "pra-description";
	const status = document.createElement("div");
	status.className = "pra-description";
	status.setAttribute("role", "status");
	status.textContent = "Loading Pocket TTS settings…";
	card.append(heading, current, status);
	container.append(card);
	void ctx.call("settings").then(({ model, builtins }) => {
		if (signal.aborted) return;
		const form = document.createElement("form");
		form.className = "pra-model";
		const selector = document.createElement("select");
		selector.className = "rounded-md border bg-background px-2 py-1";
		for (const [value, label] of [...builtins, ["hub", "Custom Hugging Face model"], ["local", "Custom local model"]]) {
			selector.add(new Option(label, value));
		}
		const input = document.createElement("input");
		input.className = selector.className;
		const voice = document.createElement("input");
		voice.className = selector.className;
		voice.placeholder = "Optional absolute audio or .safetensors path";
		const sourceLabel = document.createElement("span");
		const wrap = (label, control, description = "") => {
			const element = settingsRow(typeof label === "string" ? label : "", description, control);
			if (typeof label !== "string") element.querySelector(".pra-label").append(label);
			return element;
		};
		const source = wrap(sourceLabel, input);
		const voiceField = wrap("Voice sample", voice);
		const button = document.createElement("button");
		button.type = "submit";
		button.className = "self-start rounded-md border bg-background px-3 py-1 hover:bg-accent";
		button.textContent = "Prepare and use model";
		function update() {
			const custom = selector.value === "hub" || selector.value === "local";
			for (const field of [source, voiceField]) field.hidden = !custom;
			input.required = custom;
			sourceLabel.textContent = selector.value === "hub" ? "Hugging Face model ID" : "Local YAML file or folder";
			input.placeholder = selector.value === "hub" ? "owner/model or owner/model:path/config.yaml" : "Absolute path to config.yaml or its folder";
			input.value = selector.value === model.type ? model.source : "";
			voice.value = selector.value === model.type ? model.voice : "";
		}
		selector.value = model.type === "builtin" ? model.source : model.type;
		selector.addEventListener("change", update, { signal });
		form.addEventListener("submit", async event => {
			event.preventDefault();
			stopPlayback();
			const type = ["hub", "local"].includes(selector.value) ? selector.value : "builtin";
			const source = type === "builtin" ? selector.value : input.value;
			for (const control of [selector, input, voice, button]) control.disabled = true;
			status.textContent = "Preparing the model. The first download may take a moment…";
			try {
				model = await ctx.call("prepare-model", { type, source, voice: voice.value });
				if (!signal.aborted) { status.textContent = "Model prepared successfully."; current.textContent = "Selected model: " + model.source; }
			} catch (error) {
				if (!signal.aborted) status.textContent = error.message;
			} finally {
				for (const control of [selector, input, voice, button]) control.disabled = false;
			}
		}, { signal });
		update();
		form.append(wrap("Pocket TTS model", selector, "Choose the local speech model."), source, voiceField,
			wrap("Model setup", button, "Download and validate the selected model."));
		current.textContent = "Selected model: " + model.source;
		status.textContent = "The selected model runs locally. First use may download model files.";
		container.append(form);
	}).catch(error => { if (!signal.aborted) status.textContent = error.message; });
	return () => container.replaceChildren();
}

const SIDE_BUTTON = 'button[data-testid="side-conversation-button"][data-side-segment-id]';
const PASSAGE = '.lh-source-passage[data-source-message-id]';
const SKIP = 'pre, [data-streamdown="code-block"], [data-streamdown="code-block-header"], [data-streamdown="mermaid-block"], button, [hidden], [aria-hidden="true"], .katex-html';

function passageText(passage) {
	function read(node) {
		if (node.nodeType === 3) return node.nodeValue ?? "";
		if (node.nodeType !== 1 || node.matches(SKIP)) return "";
		if (node.tagName === "BR") return "\n";
		const body = Array.from(node.childNodes, read).join("");
		return /^(P|DIV|LI|H[1-6]|BLOCKQUOTE|TR|TD|TH)$/.test(node.tagName) ? `\n${body}\n` : body;
	}
	return read(passage).split(/\n+/).map(line => line.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n");
}

function chunkPassages(anchor) {
	const row = anchor.parentElement;
	const message = row?.closest(".is-assistant");
	if (!message || !row) return [];
	const content = message.firstElementChild;
	// A row is either inside the message content at a step boundary or
	// immediately after the content at the end of the message.
	if (!content || (row.parentElement !== content && (row.parentElement !== message || row.previousElementSibling !== content))) return [];
	const passages = [];
	let part = row.parentElement === content ? row.previousElementSibling : content.lastElementChild;
	for (; part; part = part.previousElementSibling) {
		if (part.querySelector(SIDE_BUTTON)) break;
		if (part.matches(PASSAGE)) passages.push(part);
	}
	return passages.reverse();
}

function chunkText(anchor) {
	return chunkPassages(anchor).map(passageText).filter(Boolean).join("\n\n");
}
function chunkWords(anchor) {
	const words = [];
	for (const passage of chunkPassages(anchor)) {
		const walker = document.createTreeWalker(passage, 4);
		let node;
		while ((node = walker.nextNode())) {
			if (node.parentElement.closest(SKIP)) continue;
			for (const match of node.nodeValue.matchAll(/[^\s]+/gu)) {
				words.push({ node, start: match.index, end: match.index + match[0].length, text: match[0] });
			}
		}
	}
	return words;
}
const defaults = { highlight: true, keep: true, remember: true, color: "theme" };
const storageKey = "pocket-read-aloud.v2";
function loadState() {
	try {
		const data = JSON.parse(localStorage.getItem(storageKey) || "{}");
		return { prefs: {...defaults, ...data.prefs}, positions: data.positions ?? {}, last: data.last };
	} catch { return { prefs: {...defaults}, positions: {} }; }
}
function signature(words) {
	let hash = 2166136261;
	for (const ch of words.map(word => word.text).join(" ")) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619);
	return (hash >>> 0).toString(16);
}

export function activate(ctx) {
	let active;
	let audio;
	const controls = new Map();
	const lifetime = new AbortController();
	const state = loadState();
	const name = "pocket-read-aloud-word";
	const style = document.createElement("style");
	document.head.append(style);
	function persist() {
		try { localStorage.setItem(storageKey, JSON.stringify(state)); } catch {}
	}
	function updateColor() {
		const color = /^#[0-9a-f]{6}$/i.test(state.prefs.color) ? state.prefs.color : "var(--primary, #e6e6e6)";
		const foreground = state.prefs.color === "theme" ? "var(--primary-foreground, #141414)" : (parseInt(state.prefs.color.slice(1, 3), 16) * .299 + parseInt(state.prefs.color.slice(3, 5), 16) * .587 + parseInt(state.prefs.color.slice(5, 7), 16) * .114 > 140 ? "#141414" : "#ffffff");
		style.textContent = `::highlight(${name}) { background-color: ${color}; color: ${foreground}; }`;
	}
	updateColor();
	function clearHighlight() { globalThis.CSS?.highlights?.delete(name); }
	function highlight(word) {
		clearHighlight();
		if (!state.prefs.highlight || !word?.node.isConnected || !globalThis.Highlight || !globalThis.CSS?.highlights) return;
		const range = document.createRange();
		range.setStart(word.node, word.start);
		range.setEnd(word.node, word.end);
		CSS.highlights.set(name, new Highlight(range));
	}
	function key(control) { return JSON.stringify([control.path, control.segment]); }
	function saved(control, words) {
		const position = state.positions[key(control)];
		return state.prefs.remember && position?.signature === signature(words) &&
			Number.isInteger(position.index) && position.index >= 0 && position.index < words.length ? position.index : null;
	}
	function mark(job, index) {
		job.index = index;
		highlight(job.words[index]);
		if (state.prefs.remember) {
			state.positions[key(job.control)] = { index, signature: job.signature };
			state.last = key(job.control);
			// Bound saved positions to avoid unlimited local storage growth.
			const keys = Object.keys(state.positions);
			if (keys.length > 2000) delete state.positions[keys[0]];
			persist();
		}
	}

	function render(control) {
		const pressed = active?.control === control;
		const loading = pressed && active.loading;
		const label = loading ? "Stop loading Pocket TTS" : pressed ? "Stop reading aloud" : saved(control, chunkWords(control.anchor)) !== null ? "Resume reading" : "Read aloud";
		control.restart.hidden = pressed || label !== "Resume reading";
		const { button } = control;
		button.title = label;
		button.setAttribute("aria-label", label);
		button.setAttribute("aria-pressed", String(pressed));
		if (button.dataset.state !== label) {
			button.dataset.state = label;
			button.innerHTML = pressed ? stopIcon : speaker;
			button.firstElementChild?.setAttribute("aria-hidden", "true");
		}
	}

	function finish(job, cancel = false) {
		if (active !== job) return;
		active = undefined;
		if (!state.prefs.keep || !state.prefs.highlight) clearHighlight();
		job.controller.abort();
		void audio?.suspend().catch(() => {});
		if (cancel) void ctx.call("stop", { id: job.id }).catch(() => {});
		render(job.control);
	}

	async function read(job) {
		try {
			await audio.resume();
			const signal = job.controller.signal;
			// Synthesize short groups with natural phrasing. Word timing is an
			// estimate based on the duration of the audio and relative word length.
			for (let start = job.index; start < job.words.length;) {
				signal.throwIfAborted();
				let end = start, length = 0;
				while (end < job.words.length && end - start < 15) {
					const next = job.words[end].text;
					if (length + next.length > 600 && end > start) break;
					length += next.length + 1;
					end++;
					if (/[.!?]$/.test(next)) break;
				}
				const group = job.words.slice(start, end);
				const wav = await ctx.call("speak", { id: job.id, text: group.map(w => w.text).join(" ").replace(/ +([,.;:!?])/g, "$1").slice(0, 700) });
				signal.throwIfAborted();
				const buffer = await decode(audio, wav);
				signal.throwIfAborted();
				job.loading = false;
				render(job.control);
				const begin = audio.currentTime;
				const weights = group.map(w => Math.max(2, [...w.text].length) + (/[,.!?;:]$/.test(w.text) ? 3 : 0));
				const total = weights.reduce((a, b) => a + b, 0);
				let displayed = -1;
				const update = () => {
					if (active !== job) return;
					const elapsed = Math.max(0, audio.currentTime - begin) / buffer.duration * total;
					let index = 0, boundary = weights[0];
					while (index < weights.length - 1 && elapsed >= boundary) boundary += weights[++index];
					if (displayed !== index) { displayed = index; mark(job, start + index); }
				};
				update();
				const timer = setInterval(update, 35);
				try { await play(audio, buffer, signal); } finally { clearInterval(timer); }
				signal.throwIfAborted();
				mark(job, end - 1);
				start = end;
			}
			delete state.positions[key(job.control)];
			if (state.last === key(job.control)) delete state.last;
			persist();
			clearHighlight();
		} catch (error) {
			if (active === job) showError(error, job.signal);
		} finally {
			finish(job);
		}
	}

	function toggle(control, offset) {
		const same = active?.control === control;
		if (active) finish(active, true);
		if (same && offset === undefined) return;
		const words = chunkWords(control.anchor);
		if (!words.length) return;
		const index = offset ?? saved(control, words) ?? 0;
		try { audio ??= new AudioContext(); }
		catch (error) { showError(error, lifetime.signal); return; }
		const job = {
			id: crypto.randomUUID(), control, signal: lifetime.signal, words, index, signature: signature(words),
			controller: new AbortController(), loading: true,
		};
		active = job;
		render(control);
		void read(job);
	}

	function showError(error, signal) {
		ctx.ui.openDialog({
			title: "Read aloud unavailable",
			content: container => { container.textContent = error.message; },
		}, { signal });
	}

	function remove(control) {
		if (active?.control === control) finish(active, true);
		control.lifetime.abort();
		control.button.remove();
		control.restart.remove();
		controls.delete(control.anchor);
	}

	let pathname;
	function reconcile() {
		const path = ctx.app.pathname();
		if (path !== pathname) {
			for (const control of controls.values()) remove(control);
			pathname = path;
			selected = undefined;
			clearHighlight();
		}
		if (!/^\/chat\/[^/]+$/.test(path) || lifetime.signal.aborted) return;
		for (const control of controls.values()) {
			if (!control.anchor.isConnected || control.button.parentElement !== control.anchor.parentElement ||
				control.button.nextElementSibling !== control.anchor ||
				control.anchor.getAttribute("data-side-segment-id") !== control.segment) remove(control);
		}
		for (const anchor of document.querySelectorAll(SIDE_BUTTON)) {
			if (controls.has(anchor) || !chunkText(anchor)) continue;
			const button = document.createElement("button");
			button.type = "button";
			button.className = anchor.className;
			button.style.marginInlineEnd = "4px";
			button.setAttribute("data-pocket-read-aloud", "");
			const restart = document.createElement("button");
			restart.type = "button";
			restart.className = anchor.className;
			restart.textContent = "↺";
			restart.title = "Restart from beginning";
			restart.setAttribute("aria-label", restart.title);
			const control = { anchor, button, restart, path, segment: anchor.getAttribute("data-side-segment-id"), lifetime: new AbortController() };
			button.addEventListener("click", () => toggle(control), { signal: control.lifetime.signal });
			restart.addEventListener("click", () => toggle(control, 0), { signal: control.lifetime.signal });
			controls.set(anchor, control);
			render(control);
			anchor.before(restart, button);
			if (!active && state.prefs.keep && state.last === key(control)) { const words = chunkWords(anchor); const index = saved(control, words); if (index !== null) highlight(words[index]); }
		}
	}

	let selected;
	let selectionButton;
	function selectionChanged() {
		const selection = window.getSelection();
		if (!selection || selection.isCollapsed || !selection.rangeCount) return;
		const range = selection.getRangeAt(0);
		selected = undefined;
		for (const control of controls.values()) {
			const words = chunkWords(control.anchor);
			const index = words.findIndex(word => {
				try {
										return range.comparePoint(word.node, word.end) >= 0 && range.comparePoint(word.node, word.start) <= 0 && !(range.startContainer === word.node && range.startOffset >= word.end) && !(range.endContainer === word.node && range.endOffset <= word.start);
				} catch { return false; }
			});
			if (index >= 0) { selected = { control, index }; break; }
		}
		addSelectionButton();
	}
	function addSelectionButton() {
		const toolbar = document.querySelector('[data-testid="selection-toolbar"]');
		if (!toolbar || !selected || !controls.has(selected.control.anchor)) { selectionButton?.remove(); selectionButton = undefined; return; }
		if (selectionButton?.parentElement === toolbar) return;
		selectionButton?.remove();
		const button = document.createElement("button");
		button.type = "button";
		button.className = toolbar.querySelector("button")?.className ?? "";
		button.textContent = "🔊 Read from here";
		button.addEventListener("mousedown", event => event.preventDefault());
		button.addEventListener("click", () => {
			if (selected && controls.has(selected.control.anchor)) toggle(selected.control, selected.index);
			window.getSelection()?.removeAllRanges();
			selected = undefined;
			button.remove();
		});
		selectionButton = button;
		toolbar.append(button);
	}
	document.addEventListener("selectionchange", selectionChanged, { signal: lifetime.signal });

	const observer = new MutationObserver(() => { reconcile(); addSelectionButton(); });
	observer.observe(document.body, {
		childList: true, characterData: true, subtree: true, attributes: true,
		attributeFilter: ["data-side-segment-id", "data-source-message-id"],
	});
	reconcile();

	ctx.registerSettings((container, signal) => {
		const wrapper = document.createElement("div");
		wrapper.className = "pra-settings";
		const css = document.createElement("style");
		css.textContent = settingsStyles;
		const panel = document.createElement("div");
		panel.className = "pra-section";
		const modelPanel = document.createElement("div");
		modelPanel.className = "pra-section";
		wrapper.append(css, modelPanel, panel);
		container.append(wrapper);
		const cleanup = mountSettings(ctx, modelPanel, signal, () => { if (active) finish(active, true); });
		for (const [field, label, description] of [
			["highlight", "Highlight spoken words", "Follow the text as it is read. Word timing is estimated."],
			["keep", "Keep last word highlighted", "Keep your place visible when playback stops."],
			["remember", "Remember playback position", "Resume where you left off, even after restarting LearnHarness."],
		]) {
			const input = document.createElement("input");
			input.type = "checkbox";
			input.className = "pra-switch";
			input.setAttribute("role", "switch");
			input.checked = !!state.prefs[field];
			input.addEventListener("change", () => {
				state.prefs[field] = input.checked;
				if (!state.prefs.remember) { state.positions = {}; delete state.last; }
				if (!state.prefs.highlight || (!active && !state.prefs.keep)) clearHighlight();
				for (const control of controls.values()) render(control);
				persist();
			}, { signal });
			panel.append(settingsRow(label, description, input));
		}
		const color = document.createElement("input");
		color.type = "color";
		color.value = state.prefs.color === "theme" ? "#e6e6e6" : state.prefs.color;
		color.addEventListener("input", () => { state.prefs.color = color.value; updateColor(); persist(); }, { signal });
		const reset = document.createElement("button");
		reset.type = "button";
		reset.textContent = "Use theme color";
		reset.addEventListener("click", () => { state.prefs.color = "theme"; updateColor(); persist(); }, { signal });
		const colorControls = document.createElement("span");
		colorControls.className = "pra-control";
		color.setAttribute("aria-label", "Custom highlight color");
		colorControls.append(color, reset);
		panel.append(settingsRow("Highlight color", "Choose a custom color or follow the current theme.", colorControls));
		return () => { cleanup(); wrapper.remove(); };
	});
	return () => {
		observer.disconnect();
		selectionButton?.remove();
		style.remove();
		clearHighlight();
		lifetime.abort();
		for (const control of controls.values()) remove(control);
		clearHighlight();
		return audio?.close();
	};
}
