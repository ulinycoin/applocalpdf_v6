import type { ToolRunContext } from '../../core/types/contracts';
import type { BillingPlan } from './billing-contract';

export interface PlanLimits {
  maxWorkspaces: number;
  maxPagesPerDocument: number;
}

export type LimitCheckReason = 'workspace_limit' | 'page_limit';

export interface LimitCheckResult {
  allowed: boolean;
  reason?: LimitCheckReason;
  limit?: number;
  current?: number;
}

type PlanContext = Pick<ToolRunContext, 'plan'>;

const BASIC_PLAN_LIMITS: PlanLimits = {
  maxWorkspaces: 3,
  maxPagesPerDocument: Number.POSITIVE_INFINITY,
};

const PRO_PLAN_LIMITS: PlanLimits = {
  maxWorkspaces: Number.POSITIVE_INFINITY,
  maxPagesPerDocument: Number.POSITIVE_INFINITY,
};

function normalizeCount(value: number): number {
  if (!Number.isFinite(value)) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.max(0, Math.floor(value));
}

export function getPlanLimits(plan: BillingPlan): PlanLimits {
  return (plan === 'pro' || plan === 'trial') ? PRO_PLAN_LIMITS : BASIC_PLAN_LIMITS;
}

export function canCreateWorkspace(context: PlanContext, currentWorkspaceCount: number): LimitCheckResult {
  const limits = getPlanLimits(context.plan);
  const current = normalizeCount(currentWorkspaceCount);
  if (!Number.isFinite(limits.maxWorkspaces)) {
    return { allowed: true, current, limit: limits.maxWorkspaces };
  }
  if (current < limits.maxWorkspaces) {
    return { allowed: true, current, limit: limits.maxWorkspaces };
  }
  return {
    allowed: false,
    reason: 'workspace_limit',
    current,
    limit: limits.maxWorkspaces,
  };
}

export function canUseDocumentWithPageCount(context: PlanContext, pageCount: number): LimitCheckResult {
  const limits = getPlanLimits(context.plan);
  const current = normalizeCount(pageCount);
  if (!Number.isFinite(limits.maxPagesPerDocument)) {
    return { allowed: true, current, limit: limits.maxPagesPerDocument };
  }
  if (current <= limits.maxPagesPerDocument) {
    return { allowed: true, current, limit: limits.maxPagesPerDocument };
  }
  return {
    allowed: false,
    reason: 'page_limit',
    current,
    limit: limits.maxPagesPerDocument,
  };
}

export function canAddDocumentToStudio(context: PlanContext, currentWorkspaceCount: number, pageCount: number): LimitCheckResult {
  const workspaceCheck = canCreateWorkspace(context, currentWorkspaceCount);
  if (!workspaceCheck.allowed) {
    return workspaceCheck;
  }
  return canUseDocumentWithPageCount(context, pageCount);
}
