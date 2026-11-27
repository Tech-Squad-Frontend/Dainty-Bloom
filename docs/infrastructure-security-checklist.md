# Dainty Bloom Production Infrastructure Security Checklist

Status labels:

- `IMPLEMENTED IN CODE`
- `REQUIRES HOSTING CONFIGURATION`
- `REQUIRES MANUAL VERIFICATION`

## Database

| Item | Status | Required action |
|---|---|---|
| MongoDB username/password required in production | IMPLEMENTED IN CODE | Configure a dedicated application database identity. |
| Production MongoDB TLS | IMPLEMENTED IN CODE | Use `mongodb+srv://` or `mongodb://...?tls=true`; certificate bypass options are rejected. |
| Database TLS certificate validation | IMPLEMENTED IN CODE | Hosting must provide a valid trusted CA chain and correct server name. |
| Database network restriction | REQUIRES HOSTING CONFIGURATION | Allow only application runtime IP ranges or private network peering. |
| MongoDB provider encryption at rest | REQUIRES HOSTING CONFIGURATION | Enable provider/volume encryption and document key ownership. |
| Application least privilege | REQUIRES MANUAL VERIFICATION | Do not grant `root`, `dbOwner`, or broad cluster roles to application credentials. |

### Database roles

- **Normal application**
  - Role: application-owned database role.
  - Minimum permissions: read/write on application collections, create/update indexes only if index synchronization is deliberately enabled.
  - Do not grant `clusterMonitor`, backup, user administration, shutdown, or database-management roles.
- **Migration scripts**
  - Role: separately issued migration identity with the minimum collection privileges required by the reviewed migration.
  - Must remain separate from runtime credentials and require explicit operator authorization.
- **Backup operations**
  - Role: dedicated backup identity or provider snapshot permission.
  - Read-only database access or provider snapshot privileges.
  - No application API or shell write privileges.
- **Administrative maintenance**
  - Use an operator identity that is separate from application credentials.
  - Require MFA where the provider supports it.
  - Grant temporary privileges and remove them after maintenance.

## Backups

| Item | Status | Required action |
|---|---|---|
| Encrypted backups | REQUIRES HOSTING CONFIGURATION | Enable encrypted provider snapshots or encrypt dump archives before storage. |
| Restricted backup access | REQUIRES HOSTING CONFIGURATION | Restrict storage and operator IAM to named backup administrators. |
| Backup retention | REQUIRES HOSTING CONFIGURATION | Configure agreed retention and legal/compliance hold periods. |
| Backup monitoring | REQUIRES HOSTING CONFIGURATION | Alert on failed snapshots, missing scheduled runs, or unusual backup size. |
| Immutable/versioned copies | REQUIRES HOSTING CONFIGURATION | Enable versioning or vault/immutability controls where available. |

### Restoration procedure

1. Stop writes or place the application in maintenance mode.
2. Confirm the target database and backup timestamp.
3. Restore to a new isolated database or disposable restore environment.
4. Verify application secrets, migration state, collection counts, indexes, and reconciliation references.
5. Run the application against the restored database using a separate runtime credential.
6. Execute smoke tests for authentication, order lookup, payment reconciliation, artwork access, and health.
7. Obtain explicit approval before switching production traffic.
8. Re-enable application writes and monitor for divergence, then retain the restore log.

Never restore a backup directly over production during a test.

### Safe restore test

- Quarterly, or after a major schema or payment workflow change.
- Use a disposable MongoDB instance or provider restore target.
- Never use production customer traffic or production Stripe credentials in the test environment.
- Record restore duration, verification results, data completeness, and rollback outcome.
- Delete the restore environment and temporary credentials after verification.

## HTTPS and proxy configuration

| Item | Status | Required action |
|---|---|---|
| HTTPS frontend and API | IMPLEMENTED IN CODE | Deployment must terminate HTTPS; HTTP redirects must occur at the platform/proxy. |
| Secure production cookies | IMPLEMENTED IN CODE | Production cookies are Secure and HttpOnly; verify the browser deployment origin. |
| CORS restricted to configured origin | IMPLEMENTED IN CODE | Set `CLIENT_URL` to the exact approved storefront origin. |
| API origin validation | IMPLEMENTED IN CODE | Set `API_URL` to an HTTPS origin without `/api`, path, query, or credentials. |
| TRUST_PROXY restriction | IMPLEMENTED IN CODE | `true` and wildcard proxy trust are rejected; use `false`, a hop count, or explicit proxy addresses. |
| Reverse proxy header isolation | REQUIRES HOSTING CONFIGURATION | Strip untrusted `Forwarded`/`X-Forwarded-*` headers at the edge and append trusted values only. |
| Rate-limit IP correctness | REQUIRES MANUAL VERIFICATION | Verify `req.ip` is the nearest trusted proxy address or correct client IP in deployed requests. |

Do not set `TRUST_PROXY=true`. For a known reverse proxy, configure the proxy address or a documented hop count. If the application is directly internet-facing, keep `TRUST_PROXY=false`.

## Secrets

| Item | Status | Required action |
|---|---|---|
| Secret files excluded from Git | IMPLEMENTED IN CODE | `.env`, `.env.*`, and secret-bearing local files are ignored; examples remain allowed. |
| No production secrets in frontend variables | IMPLEMENTED IN CODE | Only `NEXT_PUBLIC_*` values may reach browser builds; never place database or signing secrets there. |
| Hosting secret storage | REQUIRES HOSTING CONFIGURATION | Store production secrets in the hosting platform secret/environment manager. |
| JWT/MFA/data key rotation | REQUIRES MANUAL VERIFICATION | Maintain separate rotation schedules and key backup/re-encryption procedures. |
| Database credential rotation | REQUIRES MANUAL VERIFICATION | Create replacement credentials, deploy, validate, revoke old credentials. |

## Storage and monitoring

| Item | Status | Required action |
|---|---|---|
| Private artwork storage | IMPLEMENTED IN CODE | Local files and Cloudinary authenticated resources are not public. |
| Storage network and credential restrictions | REQUIRES HOSTING CONFIGURATION | Restrict storage paths/buckets, provider API permissions, and Cloudinary delivery settings. |
| Malware scanner availability | REQUIRES HOSTING CONFIGURATION | Deploy a maintained ClamAV endpoint and private network policy. |
| Application monitoring | REQUIRES HOSTING CONFIGURATION | Alert on database failures, TLS failures, 5xx rates, backup failures, and scanner outages. |
| Audit-log monitoring | REQUIRES HOSTING CONFIGURATION | Route append-only security events to protected monitoring or SIEM storage. |

## Rate limiting

The Express rate limiters are implemented in process-memory by default.
This is safe for a single instance but a multi-instance deployment must
replace or supplement the memory store with shared Redis/Upstash storage.
Without shared storage, totals can reset independently on every backend
instance and an attacker can distribute requests across instances.

Sensitive limits currently cover authentication, password reset, email
verification, MFA, guest lookup, payment initiation, artwork uploads,
contact forms, privacy operations, and administrative search where listed.
All proxies must be configured explicitly. Keep `TRUST_PROXY=false` for
direct internet exposure. For a known proxy, set the exact proxy addresses
or hop count and strip untrusted forwarding headers at the edge.

## Deployment verification

Before production:

- Confirm MongoDB authentication and TLS in hosted configuration.
- Confirm database user roles and network rules.
- Confirm HTTPS certificates and proxy header rewriting.
- Confirm `TRUST_PROXY`, `CLIENT_URL`, `API_URL`, and cookie settings.
- Confirm secrets are absent from Git and frontend bundle/environment output.
- Confirm encrypted, monitored backups and a successful restore test.
- Confirm malware scanning is reachable and fail-closed.
- Confirm private storage credentials and Cloudinary authenticated delivery.
