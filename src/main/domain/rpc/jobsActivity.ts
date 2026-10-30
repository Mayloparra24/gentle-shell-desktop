import type { FinishedJob } from "@shared/bridge-types";

export interface JobNotice extends Omit<FinishedJob, "endedAt" | "status"> {
  readonly status: FinishedJob["status"] | "running";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Bounds include the ellipsis; all decoded text remains untrusted plain text. */
function truncate(text: string, cap: number): string {
  return text.length > cap ? `${text.slice(0, cap - 1)}…` : text;
}

/** Decodes the actual background-jobs-tools notice, not tool results or guessed widgets. */
export function parseJobNotice(message: unknown): JobNotice | undefined {
  try {
    if (!isRecord(message) || message.role !== "custom" || message.customType !== "gentle-jobs.notice" || message.display !== true) return undefined;
    if (!isRecord(message.details) || !isRecord(message.details.gentleJobs)) return undefined;
    const job = message.details.gentleJobs;
    if (typeof job.jobId !== "string" || !job.jobId.trim() || typeof job.label !== "string" || !job.label.trim()) return undefined;
    if (job.kind !== "command" && job.kind !== "monitor") return undefined;
    if (job.status !== "exited" && job.status !== "stopped" && job.status !== "failed" && !(job.kind === "monitor" && job.status === "running")) return undefined;
    if (job.exitCode != null && (typeof job.exitCode !== "number" || !Number.isSafeInteger(job.exitCode))) return undefined;
    if (job.outputPath !== undefined && typeof job.outputPath !== "string") return undefined;
    let text: string;
    if (typeof message.content === "string") text = message.content;
    else if (Array.isArray(message.content) && message.content.every(part => isRecord(part) && part.type === "text" && typeof part.text === "string")) {
      text = message.content.map(part => part.text).join("");
    } else return undefined;
    const lines = text.replace(/\r\n/g, "\n").split("\n");
    const commandStart = lines.findIndex(line => line.startsWith("Command: "));
    const outputStart = lines.indexOf("Last output:");
    let fullOutput = -1;
    for (let index = lines.length - 1; index >= 0; index--) {
      if (lines[index]!.startsWith("Full output: ")) { fullOutput = index; break; }
    }
    const commandEnd = outputStart > commandStart ? outputStart : fullOutput > commandStart ? fullOutput : lines.length;
    const commandLines = lines.slice(commandStart, commandEnd);
    if (commandLines.at(-1) === "No output.") commandLines.pop();
    const command = commandStart < 0 ? undefined : commandLines.join("\n").slice("Command: ".length);
    // Monitor batches have a heading followed directly by event lines, no Last output marker.
    const output = outputStart >= 0 ? lines.slice(outputStart + 1, fullOutput > outputStart ? fullOutput : undefined).join("\n")
      : job.kind === "monitor" && job.event === "events" ? lines.slice(1).join("\n") : undefined;
    return { id: job.jobId, kind: job.kind, label: job.label, status: job.status,
      exitCode: typeof job.exitCode === "number" ? job.exitCode : undefined,
      command: command === undefined ? undefined : truncate(command, 1024),
      lastOutput: output === undefined ? undefined : truncate(output, 8192), outputPath: job.outputPath };
  } catch {
    return undefined;
  }
}

/** Undefined clears the status; malformed text preserves the caller's previous count. */
export function parseJobsStatus(text: unknown): number | undefined {
  if (text === undefined) return 0;
  if (typeof text !== "string") return undefined;
  const match = /^⧗ ([1-9]\d*) jobs?$/.exec(text);
  if (!match) return undefined;
  const count = Number(match[1]);
  return Number.isSafeInteger(count) ? count : undefined;
}
