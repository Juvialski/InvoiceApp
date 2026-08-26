import type { PrimaryModuleId } from '../navigation/navigationModel.ts';
import type { PermissionKey } from '../utils/accessControl.ts';
import type { RouteId } from '../utils/routes.ts';

export type FeaturePhase = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export type FeatureStatus = 'ACTIVE' | 'PLANNED' | 'FUTURE';

export type FeatureCategory =
  | 'operations'
  | 'financial'
  | 'workforce'
  | 'engineering'
  | 'field'
  | 'spatial'
  | 'procurement'
  | 'intelligence';

export interface EngoryxFeatureDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: FeatureCategory;
  readonly phase: FeaturePhase;
  readonly status: FeatureStatus;
  readonly moduleId?: PrimaryModuleId;
  readonly routeId?: RouteId;
  readonly requiredPermissions?: readonly PermissionKey[];
  readonly openSourceCandidates?: readonly string[];
  readonly documentationRef?: string;
}
