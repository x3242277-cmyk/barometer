import { getStore } from '@netlify/blobs';
export default async () => {
  const store=getStore({name:'barometer-usage',consistency:'strong'});
  const floor=Date.now()-90*864e5;
  for await (const page of store.list({prefix:'visits/',paginate:true})) {
    await Promise.all(page.blobs.filter(b=>Date.parse(b.key.split('/')[1])+864e5<floor).map(b=>store.delete(b.key)));
  }
  return new Response(null,{status:204});
};
export const config={schedule:'0 3 * * *'};
