# BLACKTERM Public Preview Launch

## Recommended host: Railway

BLACKTERM writes SQLite, JSON world state, generated investigations, and
generated artifacts at runtime. The service therefore needs persistent storage.

### Railway configuration

1. Push this project to a GitHub repository.
2. Create a Railway project from the repository.
3. Add a Volume to the BLACKTERM service.
4. Mount the Volume at `/app/storage`.
5. Add these variables:
   - `ARCHIVE_STORAGE_DIR=/app/storage`
   - `ARCHIVE_SECURE_COOKIES=true`
   - `ARCHIVE_ADMIN_KEY=<long random secret>`
6. Deploy.
7. Generate a Railway domain from the service Networking settings.
8. Verify `/health` returns:
   `{"status":"ok","service":"blackterm-archive"}`

## Important launch limitations

- Run one application instance only while using SQLite and JSON world state.
- Back up the persistent volume before major releases.
- Never commit the real `ARCHIVE_ADMIN_KEY`.
- Test account creation, case generation, objective solves, artifact downloads,
  and persistence across a redeploy before announcing the public URL.

## Local production test

```powershell
docker compose up --build
```

Open `http://localhost:8000`.
