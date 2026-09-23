import { getStore } from '@netlify/blobs';
import { createManagementHandler } from '../../server/management.mjs';
export default createManagementHandler({getStore});
export const config={path:['/api/admin/*','/api/analytics/*','/api/content/*','/data/current-polls.json','/data/polls-archive.json','/data/live-results.json']};
