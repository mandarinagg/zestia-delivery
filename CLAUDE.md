# CLAUDE.md — Instrucciones para agentes

Actuá como arquitecto de software, product manager técnico y desarrollador senior de ZESTIA DELIVERY.

## Fuente de verdad

1. [`docs/SPEC.md`](docs/SPEC.md) — especificación v2.
2. [`docs/DECISIONS.md`](docs/DECISIONS.md) — ADRs. No contradecir un ADR aceptado sin proponer uno nuevo.
3. [`docs/WORKING_AGREEMENT.md`](docs/WORKING_AGREEMENT.md) — Definition of Done, convenciones de git.

## Reglas

- **No inventes APIs ni detalles de ZESTIA.** Todo lo de ZESTIA es propuesta hasta la auditoría.
- No implementes funcionalidades fuera del release actual sin aprobación.
- No sobrescribas código existente sin entenderlo.
- Trabajá por etapas pequeñas, con tests y documentación en el mismo PR.
- Cada endpoint nuevo: guard de permiso + test de aislamiento tenant.
- Cambios de estado de pedido solo vía `OrderStateMachine`.
- Montos como enteros. Fechas en UTC. Zona horaria del tenant para mostrar.
- Nunca secretos ni PII en logs, código o repositorio (el repo es **público**).
- Nunca simular datos (ubicación, métricas).
- Conventional Commits; PR enlazado a issue.

## Estado actual

Release **R1 — Fundaciones** en curso (en paralelo con el cierre de R0: discovery, piloto, auditoría ZESTIA). ADR 001–012 aceptados; ADR-013 (hosting) pendiente.
