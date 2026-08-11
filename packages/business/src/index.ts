export interface BusinessProcessProfile {
  id: string;
  businessId: string;
  name: string;
  frequency: number;
  staffHoursPerPeriod?: number;
  revenueImpact?: number;
  errorRate?: number;
  delayImpact?: number;
  automationPotential: number;
  aiAdvantage: number;
  implementationComplexity: number;
  securityPrivacyRisk: number;
  recurringRevenuePotential: number;
}

export interface OpportunityScore {
  processId: string;
  total: number;
  rationale: string[];
  recommendedNextStep: 'ignore' | 'research' | 'pilot' | 'productize';
}
