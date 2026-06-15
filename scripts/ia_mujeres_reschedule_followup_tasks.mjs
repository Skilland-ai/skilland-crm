#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

import {
  readTwentyCredentials,
  TwentyClient,
} from './crm_manual_update_crew/twenty-client.mjs';

const BUSINESS_LINE_NAME = 'SkilLand IA Mujeres';
const CAMPAIGN_NAME = 'IA Mujeres 2026';
const TASK_REVIEW_FOLLOW_UP_1 = '[IA Mujeres] Revisar respuesta / preparar Follow-up 1';
const DEFAULT_OUTPUT_DIR = path.resolve('04_outputs/ia_mujeres_crm_execution');

function parseArgs(argv) {
  const args = {
    apply: false,
    date: undefined,
    outputDir: DEFAULT_OUTPUT_DIR,
  };

  for (const arg of argv) {
    if (arg === '--apply') args.apply = true;
    else if (arg.startsWith('--date=')) args.date = arg.slice('--date='.length);
    else if (arg.startsWith('--output-dir=')) args.outputDir = path.resolve(arg.slice('--output-dir='.length));
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!args.date || !/^\d{4}-\d{2}-\d{2}$/.test(args.date)) {
    throw new Error('--date=<yyyy-mm-dd> is required.');
  }

  return args;
}

function printHelp() {
  console.log(`IA Mujeres follow-up task rescheduler

Usage:
  node scripts/ia_mujeres_reschedule_followup_tasks.mjs --date=2026-06-22
  node scripts/ia_mujeres_reschedule_followup_tasks.mjs --date=2026-06-22 --apply

Dry-run by default. With --apply, updates open IA Mujeres Follow-up 1 tasks
and the linked opportunity followUpDueAt to 09:00 Atlantic/Canary.
`);
}

function dueAtCanaryNine(date) {
  const [year, month, day] = date.split('-').map(Number);
  // 2026-06-22 is WEST/UTC+1 in Atlantic/Canary, so 09:00 local is 08:00Z.
  return new Date(Date.UTC(year, month - 1, day, 8, 0, 0)).toISOString();
}

async function fetchFollowUpTasks(client) {
  const data = await client.gql(
    `query IaMujeresFollowUpTasks($filter: TaskFilterInput!) {
      tasks(first: 500, filter: $filter) {
        edges {
          node {
            id
            title
            status
            dueAt
            assignee { id userEmail name { firstName lastName } }
            taskTargets {
              edges {
                node {
                  targetOpportunity {
                    id
                    name
                    businessLineName
                    campaignName
                    organizationType
                    icpSegment
                    outreachStatus
                    iaMujeresFunnelStage
                    followUpDueAt
                  }
                  targetPerson {
                    id
                    name { firstName lastName }
                    emails { primaryEmail }
                  }
                  targetCompany {
                    id
                    name
                  }
                }
              }
            }
          }
        }
      }
    }`,
    { filter: { title: { ilike: '%Follow-up%' } } },
  );

  return data.tasks.edges.map((edge) => edge.node);
}

function opportunityTargets(task) {
  return (task.taskTargets?.edges ?? [])
    .map((edge) => edge.node?.targetOpportunity)
    .filter(Boolean);
}

function firstPersonTarget(task) {
  return (task.taskTargets?.edges ?? [])
    .map((edge) => edge.node?.targetPerson)
    .find(Boolean);
}

function firstCompanyTarget(task) {
  return (task.taskTargets?.edges ?? [])
    .map((edge) => edge.node?.targetCompany)
    .find(Boolean);
}

function isIaMujeresOpportunity(opportunity) {
  return opportunity?.campaignName === CAMPAIGN_NAME ||
    opportunity?.businessLineName === BUSINESS_LINE_NAME;
}

function selectTasks(tasks) {
  const selected = [];
  const skipped = [];

  for (const task of tasks) {
    const opportunities = opportunityTargets(task);
    const iaOpportunities = opportunities.filter(isIaMujeresOpportunity);
    const reason = [];
    if (task.title !== TASK_REVIEW_FOLLOW_UP_1) reason.push('not_follow_up_1_title');
    if (task.status === 'DONE') reason.push('task_done');
    if (iaOpportunities.length === 0) reason.push('not_linked_to_ia_mujeres_opportunity');

    const entry = {
      task_id: task.id,
      title: task.title,
      status: task.status,
      previous_due_at: task.dueAt ?? null,
      assignee_email: task.assignee?.userEmail ?? null,
      opportunities: iaOpportunities.map((opportunity) => ({
        id: opportunity.id,
        name: opportunity.name,
        previous_follow_up_due_at: opportunity.followUpDueAt ?? null,
        outreach_status: opportunity.outreachStatus ?? null,
        ia_mujeres_funnel_stage: opportunity.iaMujeresFunnelStage ?? null,
        organization_type: opportunity.organizationType ?? null,
        icp_segment: opportunity.icpSegment ?? null,
      })),
      person_email: firstPersonTarget(task)?.emails?.primaryEmail ?? null,
      company_name: firstCompanyTarget(task)?.name ?? null,
    };

    if (reason.length > 0) {
      skipped.push({ ...entry, reason });
    } else {
      selected.push(entry);
    }
  }

  return { selected, skipped };
}

async function updateTask(client, id, data) {
  const response = await gqlWithRateLimitRetry(
    client,
    `mutation UpdateTask($id: UUID!, $data: TaskUpdateInput!) {
      updateTask(id: $id, data: $data) { id title status dueAt }
    }`,
    { id, data },
  );
  return response.updateTask;
}

async function updateOpportunity(client, id, data) {
  const response = await gqlWithRateLimitRetry(
    client,
    `mutation UpdateOpportunity($id: UUID!, $data: OpportunityUpdateInput!) {
      updateOpportunity(id: $id, data: $data) { id name followUpDueAt }
    }`,
    { id, data },
  );
  return response.updateOpportunity;
}

function isRateLimitError(error) {
  return String(error?.message ?? '').includes('LIMIT_REACHED') ||
    String(error?.message ?? '').includes('Rate limit reached');
}

async function gqlWithRateLimitRetry(client, query, variables) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await client.gql(query, variables);
    } catch (error) {
      if (!isRateLimitError(error) || attempt === 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, 65_000));
    }
  }
  throw new Error('Rate limit retry loop exhausted.');
}

function writeReport(outputDir, report) {
  fs.mkdirSync(outputDir, { recursive: true });
  const timestamp = report.generated_at.replace(/[:.]/g, '-');
  const suffix = report.mode === 'apply' ? 'apply' : 'dry_run';
  const reportPath = path.join(outputDir, `${timestamp}_ia_mujeres_followup_reschedule_${suffix}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  return reportPath;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dueAt = dueAtCanaryNine(args.date);
  const client = new TwentyClient(readTwentyCredentials());
  const tasks = await fetchFollowUpTasks(client);
  const { selected, skipped } = selectTasks(tasks);
  const report = {
    generated_at: new Date().toISOString(),
    mode: args.apply ? 'apply' : 'dry-run',
    requested_date: args.date,
    due_at: dueAt,
    campaign_name: CAMPAIGN_NAME,
    business_line: BUSINESS_LINE_NAME,
    target_task_title: TASK_REVIEW_FOLLOW_UP_1,
    inspected_tasks: tasks.length,
    selected_count: selected.length,
    skipped_count: skipped.length,
    selected,
    skipped,
    updated_tasks: [],
    updated_opportunities: [],
  };

  if (args.apply) {
    const updatedOpportunityIds = new Set();
    for (const task of selected) {
      if (task.previous_due_at === dueAt) {
        report.updated_tasks.push({
          task_id: task.task_id,
          previous_due_at: task.previous_due_at,
          updated_due_at: dueAt,
          title: task.title,
          skipped: true,
          reason: 'already_due_at_target',
        });
      } else {
        const updatedTask = await updateTask(client, task.task_id, { dueAt });
        report.updated_tasks.push({
          task_id: task.task_id,
          previous_due_at: task.previous_due_at,
          updated_due_at: updatedTask.dueAt,
          title: updatedTask.title,
        });
      }

      for (const opportunity of task.opportunities) {
        if (updatedOpportunityIds.has(opportunity.id)) continue;
        updatedOpportunityIds.add(opportunity.id);
        if (opportunity.previous_follow_up_due_at === dueAt) {
          report.updated_opportunities.push({
            opportunity_id: opportunity.id,
            name: opportunity.name,
            previous_follow_up_due_at: opportunity.previous_follow_up_due_at,
            updated_follow_up_due_at: dueAt,
            skipped: true,
            reason: 'already_follow_up_due_at_target',
          });
        } else {
          const updatedOpportunity = await updateOpportunity(client, opportunity.id, { followUpDueAt: dueAt });
          report.updated_opportunities.push({
            opportunity_id: opportunity.id,
            name: opportunity.name,
            previous_follow_up_due_at: opportunity.previous_follow_up_due_at,
            updated_follow_up_due_at: updatedOpportunity.followUpDueAt,
          });
        }
      }
    }
  }

  const reportPath = writeReport(args.outputDir, report);
  console.log(JSON.stringify({
    status: 'ok',
    mode: report.mode,
    requested_date: report.requested_date,
    due_at: report.due_at,
    inspected_tasks: report.inspected_tasks,
    selected_count: report.selected_count,
    skipped_count: report.skipped_count,
    updated_tasks: report.updated_tasks.length,
    updated_opportunities: report.updated_opportunities.length,
    reportPath,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
