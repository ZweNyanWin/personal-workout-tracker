-- Desktop QR login requests are server-only. No browser role can read or write tokens.
CREATE TABLE qr_login_requests (
  id UUID PRIMARY KEY,
  desktop_secret_hash TEXT NOT NULL,
  approval_secret_hash TEXT NOT NULL,
  verification_code CHAR(6) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'authorizing', 'approved', 'consumed', 'failed')),
  approved_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  consumed_at TIMESTAMPTZ
);

CREATE INDEX qr_login_requests_expires_at_idx ON qr_login_requests (expires_at);
ALTER TABLE qr_login_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON qr_login_requests FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON qr_login_requests TO service_role;
