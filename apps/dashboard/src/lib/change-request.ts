// P12: human "request changes" note parsing for the final-gate API.
// Kept pure so the guard semantics are unit-testable without a database.

export const MAX_CHANGE_NOTE_CHARS = 2000;

export type ChangeNoteParse = { ok: true; note: string } | { ok: false; error: string };

/** The merge gate requires a human to say WHAT must change — an empty note
 *  would send the coder in blind. Bounded like approval comments. */
export function parseChangeRequestNote(body: unknown): ChangeNoteParse {
  const comments = (body as { comments?: unknown } | null)?.comments;
  if (typeof comments !== 'string' || !comments.trim()) {
    return { ok: false, error: `Describe the required changes (max ${MAX_CHANGE_NOTE_CHARS.toLocaleString()} characters).` };
  }
  if (comments.length > MAX_CHANGE_NOTE_CHARS) {
    return { ok: false, error: `Change request is limited to ${MAX_CHANGE_NOTE_CHARS.toLocaleString()} characters.` };
  }
  return { ok: true, note: comments.trim() };
}
