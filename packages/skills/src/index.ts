export type SkillStatus = 'draft' | 'testing' | 'certified' | 'deprecated';
export type SkillRisk = 'low' | 'medium' | 'high';

export interface SkillManifest {
  id: string;
  version: string;
  purpose: string;
  requiredTools: string[];
  requiredPermissions: string[];
  riskCeiling: SkillRisk;
  contextRequirements: string[];
  evalSuites: string[];
  owner: string;
  status: SkillStatus;
  sourceCommit: string;
}

export interface SkillCertificationEvidence {
  sandboxPassed: boolean;
  securityReviewPassed: boolean;
  evalResults: Record<string, boolean>;
}

export interface SkillMetadata extends Pick<SkillManifest, 'id' | 'version' | 'purpose' | 'riskCeiling' | 'status'> {}
export interface SkillSource { manifest: SkillManifest; loadInstructions(): Promise<string> }

const semver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/;
const commit = /^[0-9a-f]{40}$/;
const identifier = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;

export function validateSkillManifest(manifest: SkillManifest): string[] {
  const errors: string[] = [];
  if (!identifier.test(manifest.id)) errors.push('id must be a stable lowercase identifier');
  if (!semver.test(manifest.version)) errors.push('version must be semantic versioning');
  if (!manifest.purpose.trim()) errors.push('purpose is required');
  if (!manifest.owner.trim()) errors.push('owner is required');
  if (!commit.test(manifest.sourceCommit)) errors.push('sourceCommit must be a full lowercase commit SHA');
  if (new Set(manifest.requiredTools).size !== manifest.requiredTools.length) errors.push('requiredTools must be unique');
  if (new Set(manifest.requiredPermissions).size !== manifest.requiredPermissions.length) errors.push('requiredPermissions must be unique');
  if (manifest.status === 'certified' && manifest.evalSuites.length === 0) errors.push('certified skills require eval suites');
  return errors;
}

export function certifySkill(manifest: SkillManifest, evidence: SkillCertificationEvidence): SkillManifest {
  const errors = validateSkillManifest({...manifest, status: 'testing'});
  if (errors.length) throw new Error(`Invalid skill manifest: ${errors.join('; ')}`);
  if (!evidence.sandboxPassed) throw new Error('Certification requires a passing sandbox run');
  if (!evidence.securityReviewPassed) throw new Error('Certification requires a passing security review');
  if (!manifest.evalSuites.length || manifest.evalSuites.some(suite => evidence.evalResults[suite] !== true)) {
    throw new Error('Certification requires every declared eval suite to pass');
  }
  return {...manifest, status: 'certified'};
}

export class SkillRegistry {
  private readonly skills = new Map<string, SkillSource>();

  register(source: SkillSource): void {
    const errors = validateSkillManifest(source.manifest);
    if (errors.length) throw new Error(`Invalid skill manifest: ${errors.join('; ')}`);
    if (source.manifest.status !== 'certified') throw new Error('Only certified skills may enter the runtime registry');
    const key = `${source.manifest.id}@${source.manifest.version}`;
    if (this.skills.has(key)) throw new Error(`Immutable skill version already registered: ${key}`);
    this.skills.set(key, source);
  }

  list(): SkillMetadata[] {
    return [...this.skills.values()].map(({manifest}) => ({id: manifest.id, version: manifest.version, purpose: manifest.purpose, riskCeiling: manifest.riskCeiling, status: manifest.status}));
  }

  async select(id: string, version: string, grantedPermissions: readonly string[]): Promise<{manifest: SkillManifest; instructions: string}> {
    const source = this.skills.get(`${id}@${version}`);
    if (!source) throw new Error('Skill version is not certified or registered');
    const missing = source.manifest.requiredPermissions.filter(permission => !grantedPermissions.includes(permission));
    if (missing.length) throw new Error(`Missing skill permissions: ${missing.join(', ')}`);
    const instructions = await source.loadInstructions();
    if (!instructions.trim()) throw new Error('Certified skill instructions are empty');
    return {manifest: source.manifest, instructions};
  }
}
