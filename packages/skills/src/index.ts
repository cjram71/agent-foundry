export type SkillStatus = 'draft' | 'testing' | 'certified' | 'deprecated';

export interface SkillManifest {
  id: string;
  version: string;
  purpose: string;
  requiredTools: string[];
  requiredPermissions: string[];
  riskCeiling: 'low' | 'medium' | 'high';
  contextRequirements: string[];
  evalSuites: string[];
  owner: string;
  status: SkillStatus;
  sourceCommit: string;
}
