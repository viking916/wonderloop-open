/** The toast for a failed save. The Firebase error code rides along when there is one, so a
 * parent reporting "it did not save" can say which kind of did-not-save it was. */
export function saveFailureMessage(err: unknown): string {
  const code =
    typeof err === "object" && err !== null && typeof (err as { code?: unknown }).code === "string"
      ? (err as { code: string }).code
      : undefined;
  return code ? `That did not save (${code}). Check your connection and try again.` : "That did not save. Check your connection and try again.";
}
