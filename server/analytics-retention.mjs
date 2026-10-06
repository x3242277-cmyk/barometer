const DAY = 864e5;

export async function pruneUsage(store, now = Date.now(), collectFresh = true) {
  const fresh = [];
  const floor = now - 90 * DAY;
  let removed = 0;
  for await (const page of store.list({ prefix: 'visits/', paginate: true })) {
    const expired = page.blobs.filter(blob => Date.parse(blob.key.split('/')[1]) + DAY < floor);
    const expiredKeys = new Set(expired.map(blob => blob.key));
    await Promise.all(expired.map(blob => store.delete(blob.key)));
    if (collectFresh) fresh.push(...page.blobs.filter(blob => !expiredKeys.has(blob.key)));
    removed += expired.length;
  }
  return { fresh, removed };
}
