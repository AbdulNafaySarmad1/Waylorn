# Local integration services

This Compose file is for localhost verification only. It runs PostgreSQL, Keycloak, Valkey, NATS JetStream, and Redpanda without production security settings. Ports bind to loopback.

Create `deploy/dev/.env` with random `WAYLORN_DB_PASSWORD` and `WAYLORN_KC_ADMIN_PASSWORD`, then run `docker compose --env-file deploy/dev/.env -f deploy/dev/compose.yaml up -d`. The `.env` file is ignored by Git. Stop with `docker compose --env-file deploy/dev/.env -f deploy/dev/compose.yaml down`; do not use `down -v` unless test data can be discarded.

Use this stack only to verify migrations, live identity, cache loss, and broker contracts. It is not a supported deployment profile.

Run `pwsh -File deploy/dev/bootstrap-keycloak.ps1` after Keycloak is ready. The script creates a local `waylorn` realm, one API client, and separate administrator and approver users. It stores random test passwords and scope IDs in the ignored `.env` file; no passwords are printed. This direct-grant client is for local tests only.

Start the .NET API on `http://127.0.0.1:18081` with `ASPNETCORE_ENVIRONMENT=Development`, `Authentication__Authority=http://127.0.0.1:18080/realms/waylorn`, `Authentication__Audience=waylorn-api`, `Authentication__AllowInsecureLoopback=true`, `ConnectionStrings__Waylorn` for the local database, `Eventing__Enabled=true`, `Eventing__NatsUrl=nats://127.0.0.1:14222`, `Eventing__KafkaBootstrapServers=127.0.0.1:19092`, `Eventing__BootstrapDestinations=true`, and `Cache__Endpoint=127.0.0.1:16379`. Read the database password from the ignored `.env`; never paste it into a committed configuration file. Run `pwsh -File deploy/dev/smoke.ps1` to verify real JWT validation, PostgreSQL-backed asset creation, an AMBER approval record, and RED denial without MFA. Query `Outbox` to confirm `PublishedUtc` is set after broker acknowledgement.
