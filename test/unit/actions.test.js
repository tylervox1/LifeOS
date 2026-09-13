
import test from 'node:test';
import assert from 'node:assert/strict';

test('approval action types remain explicitly allowlisted', async () => {
  const source = await import('node:fs/promises').then(fs => fs.readFile(new URL('../../server/actions.js', import.meta.url),'utf8'));
  assert.match(source,/create_email_draft/);
  assert.match(source,/send_email/);
  assert.match(source,/create_calendar_event/);
  assert.doesNotMatch(source,/transfer_money/);
});
