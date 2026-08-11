export type MemoryKind = 'observation' | 'episodic' | 'knowledge' | 'preference' | 'decision' | 'procedure' | 'skill' | 'policy';

export interface MemoryRecord {
  kind: MemoryKind;
  content: string;
  source: string;
  sourceReference?: string;
  projectId?: string;
  businessId?: string;
  confidence?: number;
  sensitivity?: string;
  trustLevel: 'untrusted' | 'reviewed' | 'trusted';
  observedAt?: string;
  reviewAt?: string;
  expiresAt?: string;
  provenance: string;
}

export interface RetrievalResult extends MemoryRecord {
  lexicalScore?: number;
  semanticScore?: number;
  fusedScore?: number;
}
