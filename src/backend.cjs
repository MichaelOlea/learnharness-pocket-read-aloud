"use strict";

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");

const DEFAULT = { type: "builtin", source: "english_18m_2026-10", voice: "" };
const BUILTINS = [
	["english_18m_2026-10", "English (18M, ~111 MB model download)"],
	["english_7m_2026-10", "English (7M)"],
	["english_2m_2026-10", "English (2M)"],
	["english", "English (standard)"],
	["french", "French"], ["german", "German"], ["italian", "Italian"],
	["portuguese", "Portuguese"], ["spanish", "Spanish"], ["dutch", "Dutch"],
];
const IDLE_MS = 120_000;
const REQUEST_MS = 10 * 60_000;
const PLAYBACK_ID = /^[a-f\d-]{36}$/i;

function parseSettings(input) {
	const { type, source, voice: rawVoice = "" } = input ?? {};
	if (typeof source !== "string" || source.length > 2048 || typeof rawVoice !== "string" || rawVoice.length > 2048) {
		throw new Error("Invalid Pocket TTS model or voice.");
	}
	const normalized = source.trim();
	const voice = rawVoice.trim();
	if (voice && !path.isAbsolute(voice)) throw new Error("Use an absolute path for the local voice sample.");
	if (type === "builtin" && BUILTINS.some(([id]) => id === normalized)) return { type, source: normalized, voice: "" };
	if (type === "local" && path.isAbsolute(normalized)) return { type, source: normalized, voice };
	if (type === "hub") {
		const match = /^([\w.-]+\/[\w.-]+)(?::([\w./-]+\.ya?ml))?$/.exec(normalized);
		if (match && !match[1].split("/").some(part => part === "." || part === "..") &&
			!match[2]?.split("/").some(part => !part || part === ".." || part === ".")) {
			return { type, source: `${match[1]}:${match[2] ?? "config.yaml"}`, voice };
		}
	}
	throw new Error("Choose a Pocket TTS model, a Hugging Face model ID, or an absolute local configuration path.");
}

function activate(ctx) {
	const settingsFile = path.join(ctx.dataDirectory, "settings.json");
	let settings = DEFAULT;
	try { settings = parseSettings(JSON.parse(fs.readFileSync(settingsFile, "utf8"))); }
	catch (error) { if (error.code !== "ENOENT") throw error; }
	let worker;
	let preparing = false;
	const cancelled = new Set();

	function stop(current, reason) {
		if (!current || worker !== current) return;
		worker = undefined;
		clearTimeout(current.idle);
		clearTimeout(current.request?.timeout);
		current.request?.reject(new Error(reason));
		current.child.kill();
	}

	function start() {
		const python = process.env.LH_POCKET_TTS_PYTHON || (process.platform === "win32" ? "python" : "python3");
		const child = spawn(python, ["-u", path.join(ctx.directory, "worker.py")], {
			windowsHide: true,
			stdio: ["pipe", "pipe", "ignore"],
		});
		const current = { child };
		worker = current;
		const failed = () => stop(current, "Pocket TTS stopped. Check the Python installation and model setup.");
		child.once("error", () => stop(current, "Could not start Python. Install Pocket TTS or set LH_POCKET_TTS_PYTHON."));
		child.once("exit", failed);
		child.stdin.on("error", failed);
		const lines = readline.createInterface({ input: child.stdout });
		lines.on("line", line => {
			if (worker !== current || !current.request) return;
			const request = current.request;
			let reply;
			try { reply = JSON.parse(line); }
			catch { stop(current, "Pocket TTS returned an invalid response."); return; }
			clearTimeout(request.timeout);
			current.request = undefined;
			current.idle = setTimeout(() => stop(current, "Pocket TTS is idle."), IDLE_MS);
			if (reply.error) request.reject(new Error(reply.error));
			else request.resolve(reply.result);
		});
		return current;
	}

	function run(model, text, id, probe = false) {
		ctx.signal.throwIfAborted();
		if (worker?.request) stop(worker, "Playback was superseded.");
		const current = worker ?? start();
		clearTimeout(current.idle);
		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => stop(current, "Pocket TTS timed out."), REQUEST_MS);
			current.request = { id, resolve, reject, timeout };
			current.child.stdin.write(JSON.stringify({ model, text, probe }) + "\n");
		});
	}

	ctx.handle("settings", () => ({ model: settings, builtins: BUILTINS }));
	ctx.handle("prepare-model", async input => {
		if (preparing) throw new Error("A model is already being prepared.");
		const next = parseSettings(input);
		preparing = true;
		try {
			await run(next, undefined, undefined, true);
			ctx.signal.throwIfAborted();
			fs.writeFileSync(settingsFile + ".tmp", JSON.stringify(next), { mode: 0o600 });
			fs.renameSync(settingsFile + ".tmp", settingsFile);
			settings = next;
			return settings;
		} finally { preparing = false; }
	});
	ctx.handle("speak", ({ id, text } = {}) => {
		if (preparing) throw new Error("Wait for the model download to finish.");
		if (typeof id !== "string" || !PLAYBACK_ID.test(id) || typeof text !== "string" || !text.trim() || text.length > 700) {
			throw new Error("Invalid read-aloud request.");
		}
		if (cancelled.has(id)) throw new Error("Playback stopped.");
		return run(settings, text, id);
	});
	ctx.handle("stop", ({ id } = {}) => {
		if (typeof id !== "string" || !PLAYBACK_ID.test(id)) return null;
		// Stop can reach the server before an already sent synthesis request.
		cancelled.add(id);
		if (cancelled.size > 64) cancelled.delete(cancelled.values().next().value);
		if (worker?.request?.id === id) stop(worker, "Playback stopped.");
		return null;
	});
	return () => stop(worker, "Pocket Read Aloud was disabled.");
}

module.exports = { activate };
