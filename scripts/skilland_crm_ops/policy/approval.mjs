import { RouterError } from '../errors.mjs';
import { validateOperationApproval, validateOperationPlan } from '../validation.mjs';
import {
  canonicalJson,
  constantTimeHashEqual,
} from './canonical-json.mjs';
import { verifyOperationPlanHash } from './plan.mjs';
import { isScopeContained, operationsFitScope } from './scope.mjs';

function mismatch(message = 'The approval is not bound to this exact operation plan.') {
  throw new RouterError('APPROVAL_MISMATCH', {
    publicMessage: message,
    outcome: 'blocked',
  });
}

function expired() {
  throw new RouterError('APPROVAL_EXPIRED');
}

function nowMilliseconds(now) {
  const value = typeof now === 'function' ? now() : now;
  const parsed = value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new RouterError('INVALID_APPROVAL', {
      publicMessage: 'The approval clock is invalid.',
    });
  }
  return parsed;
}

export function validatePlanBoundApproval({ plan, approval, now }) {
  validateOperationPlan(plan);
  verifyOperationPlanHash(plan);
  if (approval === null || approval === undefined) {
    throw new RouterError('APPROVAL_REQUIRED');
  }
  validateOperationApproval(approval);

  if (plan.mode !== 'apply') mismatch('Only apply plans can consume approvals.');
  if (!['operator', 'owner', 'two_stage'].includes(plan.risk.approvalTier)) {
    mismatch('The plan does not have an approvable policy tier.');
  }
  if (
    approval.approver.type !== 'human' ||
    approval.approvalStages.some((stage) => stage.approver.type !== 'human')
  ) {
    throw new RouterError('INVALID_APPROVAL', {
      publicMessage: 'Every approval decision must be made by a human identity.',
    });
  }

  for (const key of [
    'requestId',
    'correlationId',
    'repoId',
    'capabilityId',
    'mode',
  ]) {
    if (approval[key] !== plan[key]) mismatch();
  }
  if (
    canonicalJson(approval.requester) !== canonicalJson(plan.requester) ||
    canonicalJson(approval.environment) !== canonicalJson(plan.environment) ||
    approval.planId !== plan.planId ||
    approval.approvalTier !== plan.risk.approvalTier ||
    !constantTimeHashEqual(approval.approvedPlanHash, plan.planHash)
  ) {
    mismatch();
  }
  if (
    approval.decision !== 'approved' ||
    approval.approvalStages.some((stage) => stage.decision !== 'approved')
  ) {
    mismatch('The approval or one of its required stages is not approved.');
  }
  if (!isScopeContained(approval.allowedScope, plan.scopeLimits)) {
    mismatch('The approval scope expands or changes the operation plan scope.');
  }
  if (!operationsFitScope(plan.operations, approval.allowedScope)) {
    mismatch('The approval scope does not cover every planned operation.');
  }

  const current = nowMilliseconds(now);
  const planCreated = Date.parse(plan.createdAt);
  const planExpires = Date.parse(plan.expiresAt);
  const approvalCreated = Date.parse(approval.createdAt);
  const approvalDecided = Date.parse(approval.decidedAt);
  const approvalExpires = Date.parse(approval.expiresAt);
  if (planCreated > current || approvalCreated < planCreated || approvalDecided > current) {
    mismatch('Approval timestamps are not coherent with the operation plan.');
  }
  if (
    planExpires <= current ||
    approvalExpires <= current ||
    approvalExpires > planExpires
  ) {
    expired();
  }
  for (const stage of approval.approvalStages) {
    const decidedAt = Date.parse(stage.decidedAt);
    if (
      decidedAt < approvalCreated ||
      decidedAt > approvalDecided ||
      decidedAt > current ||
      decidedAt >= approvalExpires
    ) {
      mismatch('An approval stage timestamp is incoherent.');
    }
  }

  return approval;
}
