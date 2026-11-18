# Despliegue

> Estado: **Pendiente** de ADR-013 (hosting). Se completa en R1.

## Entornos

| Entorno | Propósito | Deploy |
|---------|-----------|--------|
| `local` | Desarrollo (Docker Compose: Postgres, Mailpit) | Manual |
| `staging` | QA, demos, pruebas con piloto | Automático al merge en `main` |
| `production` | Clientes | Manual por tag `vX.Y.Z` con aprobación |

## Principios

- Imagen Docker única para `api` (+ worker en el mismo binario con flag), `web` como estáticos.
- **Mismo origen:** web y API bajo el mismo dominio. El proxy inverso sirve los estáticos y reenvía `/api` a la API. No hay CORS, y la cookie `__Host-` y el control CSRF por `Origin` dependen de eso. `APP_ORIGINS` y `WEB_BASE_URL` apuntan a ese dominio y `TRUST_PROXY_HOPS` es la cantidad de proxies.
- Migraciones Prisma ejecutadas como paso previo y compatibles hacia atrás (expand/contract).
- Variables por entorno en el gestor de secretos del proveedor.
- Healthchecks `/health/live`, `/health/ready`.
- Rollback: redeploy del tag anterior; migraciones nunca destructivas en el mismo release.
- Backups automáticos + PITR; restauración probada mensualmente.

## Pendiente de definir

- Proveedor y región (ADR-013).
- Dominio y DNS.
- Monitoreo de errores y uptime.
- Presupuesto mensual objetivo.
