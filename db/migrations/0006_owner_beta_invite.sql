INSERT INTO beta_invites(code_hash, label, max_uses, expires_at, created_by)
VALUES (
  '340c45d3c4a3ca9b3f513e3a5139d5f127837e579f33a25721c3bccc64008a83',
  'Owner beta invite',
  1,
  NULL,
  'system migration'
)
ON CONFLICT (code_hash) DO NOTHING;
