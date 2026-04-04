const MAX_LINES = 400;

/** Local wall-clock time (not UTC), YYYY-MM-DD HH:mm:ss.mmm */
export function formatDiagnosticTimestampLocal(d = new Date()): string {
	const pad = (n: number) => String(n).padStart(2, "0");
	const ms = String(d.getMilliseconds()).padStart(3, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${ms}`;
}

export class DiagnosticLog {
	private lines: string[] = [];

	append(message: string): void {
		const ts = formatDiagnosticTimestampLocal();
		const line = `[${ts}] ${message}`;
		this.lines.push(line);
		if (this.lines.length > MAX_LINES) {
			this.lines.splice(0, this.lines.length - MAX_LINES);
		}
		// Also mirror to devtools
		console.debug(`[Telegram LLM Journal] ${line}`);
	}

	getText(): string {
		return this.lines.join("\n");
	}

	clear(): void {
		this.lines = [];
	}
}
