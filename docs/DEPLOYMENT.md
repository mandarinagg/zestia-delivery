# Despliegue

> Estado: **Pendiente** de ADR-013 (hosting). Se completa en R1.

## Entornos

| Entorno | Propósito | Deploy |
|---------|-----------|--------|
| `local` | Desarrollo (Docker Compose: Postgres, Mailpit) | Manual |
| `staging` | QA, demos, pruebas con piloto | Automático al merge en `main` |
| `production` | Clientes | Manual por tag `vX.Y.Z` con aprobación |

## Principios

- Imagen Docker única para `api` (+ worker en el mismo binario con flag), `web` como estáticos en CDN.
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
