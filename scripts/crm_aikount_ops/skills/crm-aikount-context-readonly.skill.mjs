import { resolveCrmContext } from '../kernel/twenty-context.mjs';

export async function runCrmAikountContextReadonlySkill({
  client,
  request,
  interviewer,
}) {
  return resolveCrmContext({
    client,
    dealLookup: request.dealLookup,
    interviewer,
  });
}
