// Types of policy-unit-sharing.mjs, for the TypeScript tests that import it.

export declare const RULE_PREFIX: string;
export declare const POLICY_OBJECT: string;

export interface DesiredRule {
  name: string;
  label: string;
  description: string;
  object: string;
  criteria: { owning_unit: string };
  recipientType: 'unit_and_subordinates';
  recipientId: string;
  accessLevel: 'read';
  active: true;
}

export interface ReconcileResult {
  policies: number;
  units: number;
  created: string[];
  updated: string[];
  unchanged: string[];
  removed: string[];
}

/** One API call relative to `/api/v1`, as the operator. */
export type ApiRequest = (method: string, path: string, body?: unknown) => Promise<Response>;

export declare function ruleNameFor(unitId: string): string;
export declare function desiredRule(unitId: string, unitName?: string): DesiredRule;
export declare function ruleMatches(row: Record<string, unknown>, want: DesiredRule): boolean;
export declare function owningUnits(
  request: ApiRequest,
  opts?: { pageSize?: number },
): Promise<{ counts: Map<string, number>; total: number }>;
export declare function reconcilePolicyUnitRules(
  request: ApiRequest,
  opts?: { dryRun?: boolean; log?: (line: string) => void },
): Promise<ReconcileResult>;
