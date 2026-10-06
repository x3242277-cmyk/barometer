import { getStore } from '@netlify/blobs';
import { pruneUsage } from '../../server/analytics-retention.mjs';
export default async () => {
  await pruneUsage(getStore({name:'barometer-usage',consistency:'strong'}), Date.now(), false);
  return new Response(null,{status:204});
};
export const config={schedule:'0 3 * * *'};
