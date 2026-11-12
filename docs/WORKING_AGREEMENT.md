# Acuerdo de trabajo

## Cadencia

- **Sprints:** 1 semana en R0–R3; 2 semanas desde R4.
- **Planning** (lunes, 45 min) · **Daily** asíncrona por escrito · **Review/Demo** (viernes, 30 min) · **Retro** (viernes, 20 min).
- Riesgos ([`RISKS.md`](RISKS.md)) y decisiones ([`DECISIONS.md`](DECISIONS.md)) se revisan en cada planning.

## Backlog en GitHub

- **Milestones** = releases (R0…R6).
- **Labels:** `tipo:*` (epic, story, task, bug, spike, decision), `prioridad:P0|P1|P2`, `area:*`.
- Historias con formato: *Como [rol] quiero [acción] para [beneficio]* + criterios de aceptación Given/When/Then.
- Estimación en puntos (1, 2, 3, 5, 8). > 8 → dividir.

## Definition of Ready

- Historia con criterios de aceptación verificables.
- Dependencias identificadas; diseño/wireframe si tiene UI.
- Impacto en permisos y tenant analizado.
- Estimada.

## Definition of Done

- Código revisado (≥ 1 aprobación) y mergeado a `main` vía PR.
- Tests (unit/integración; E2E si es flujo crítico) en verde en CI.
- Test de aislamiento tenant y permisos si agrega endpoint.
- Auditoría si es acción crítica.
- Sin secretos ni PII en logs.
- Docs actualizadas (`docs/*`, OpenAPI, `KNOWN_LIMITATIONS.md` si aplica).
- Desplegado en staging y validado por PO.

## Git

- Rama `main` protegida. Ramas `feat/…`, `fix/…`, `docs/…`, `chore/…`.
- **Conventional Commits** (`feat(orders): …`).
- PR pequeños (< 400 líneas idealmente), enlazados a issue (`Closes #N`).
- Squash merge.
