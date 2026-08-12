export interface KnowledgeAgentResult {
  completed: string[];
  waitingForApproval: string[];
  uncertain: string[];
  evidence: string[];
  memoryCandidates: Array<{ summary: string; content: string; sourceReference: string; confidence: number }>;
  artifact: string;
}
const strings = (value: unknown, name: string, max = 30): string[] => {
  if (!Array.isArray(value) || value.length > max || value.some(x => typeof x !== 'string' || !x.trim() || x.length > 2000)) throw new Error(`${name} must be a bounded string array`);
  return value.map(x => String(x).trim());
};
export function parseKnowledgeAgentResult(raw: string): KnowledgeAgentResult {
  if (raw.length > 200_000) throw new Error('Agent result exceeds 200 KB');
  const value = JSON.parse(raw.replace(/^[^{]*/, '').replace(/[^}]*$/, '')) as Record<string, unknown>;
  const artifact = typeof value.artifact === 'string' ? value.artifact.trim() : '';
  if (!artifact || artifact.length > 120_000) throw new Error('artifact is required and must be bounded');
  const evidence = strings(value.evidence, 'evidence', 60);
  if (evidence.length < 2) throw new Error('At least two evidence references are required');
  const candidates = Array.isArray(value.memoryCandidates) ? value.memoryCandidates : [];
  if (candidates.length > 10) throw new Error('Too many memory candidates');
  const memoryCandidates = candidates.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(`memoryCandidates[${index}] is invalid`);
    const row = item as Record<string, unknown>;
    const summary = typeof row.summary === 'string' ? row.summary.trim() : '';
    const content = typeof row.content === 'string' ? row.content.trim() : '';
    const sourceReference = typeof row.sourceReference === 'string' ? row.sourceReference.trim() : '';
    const confidence = typeof row.confidence === 'number' ? row.confidence : -1;
    if (!summary || summary.length > 500 || !content || content.length > 4000 || !sourceReference || sourceReference.length > 2000 || confidence < 0 || confidence > 1) throw new Error(`memoryCandidates[${index}] is invalid`);
    return { summary, content, sourceReference, confidence };
  });
  return { completed: strings(value.completed, 'completed'), waitingForApproval: strings(value.waitingForApproval, 'waitingForApproval'), uncertain: strings(value.uncertain, 'uncertain'), evidence, memoryCandidates, artifact };
}
