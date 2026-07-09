function formatUnknownRecord(error: Record<string, unknown>): string | null {
  const message = typeof error.message === "string" && error.message.trim() ? error.message.trim() : null;
  const details = typeof error.details === "string" && error.details.trim() ? error.details.trim() : null;
  const hint = typeof error.hint === "string" && error.hint.trim() ? error.hint.trim() : null;
  const code = typeof error.code === "string" && error.code.trim() ? error.code.trim() : null;

  if (!message && !details && !hint && !code) {
    return null;
  }

  return [
    message,
    details ? `Details: ${details}` : null,
    hint ? `Hint: ${hint}` : null,
    code ? `Code: ${code}` : null
  ]
    .filter(Boolean)
    .join(" | ");
}

export function getSyncErrorMessage(error: unknown, fallback = "Unknown sync error"): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }

  if (error && typeof error === "object") {
    const formattedRecord = formatUnknownRecord(error as Record<string, unknown>);
    if (formattedRecord) {
      return formattedRecord;
    }

    try {
      return JSON.stringify(error);
    } catch {
      return fallback;
    }
  }

  return fallback;
}
