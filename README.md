# ZESTIA DELIVERY

Plataforma web SaaS multiempresa para gestionar empresas de delivery — pedidos, despacho, repartidores, efectivo, seguimiento e integraciones — pensada para Paraguay e integrable con ZESTIA.

> **Estado:** 🟡 **R0 — Discovery.** Este repositorio contiene la especificación, el plan y el backlog. El código empieza en R1, una vez aprobadas las decisiones de arquitectura.

## Por dónde empezar

| Si querés… | Leé |
|------------|-----|
| Entender el producto | [`docs/PRODUCT_OVERVIEW.md`](docs/PRODUCT_OVERVIEW.md) |
| Ver el análisis y las propuestas de PM | [`docs/00_ANALISIS_PM.md`](docs/00_ANALISIS_PM.md) |
| La especificación completa (v2) | [`docs/SPEC.md`](docs/SPEC.md) |
| El plan y los releases | [`docs/ROADMAP.md`](docs/ROADMAP.md) · [Milestones](https://github.com/mandarinagg/zestia-delivery/milestones) |
| La arquitectura propuesta | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · [`docs/DECISIONS.md`](docs/DECISIONS.md) |
| Cómo trabajamos | [`docs/WORKING_AGREEMENT.md`](docs/WORKING_AGREEMENT.md) · [`CONTRIBUTING.md`](CONTRIBUTING.md) |

## Documentación

- [Especificación v2](docs/SPEC.md) — [v1 original](docs/archive/01_ZESTIA_DELIVERY_v1.md)
- [Máquina de estados del pedido](docs/ORDER_STATE_MACHINE.md)
- [Modelo de datos](docs/DATA_MODEL.md)
- [Contratos de API](docs/API_CONTRACTS.md)
- [Integración ZESTIA](docs/ZESTIA_INTEGRATION.md) *(propuesta, sin confirmar)*
- [Seguridad y privacidad](docs/SECURITY.md)
- [Pruebas](docs/TESTING.md)
- [Despliegue](docs/DEPLOYMENT.md)
- [Riesgos](docs/RISKS.md)
- [Discovery](docs/DISCOVERY.md)
- [Limitaciones conocidas](docs/KNOWN_LIMITATIONS.md)

## Stack propuesto (pendiente de aprobación)

pnpm + Turborepo · NestJS + TypeScript · PostgreSQL + Prisma + RLS · pg-boss · SSE · React + Vite + TanStack + shadcn/ui · PWA · Docker · GitHub Actions · Vitest + Playwright.

## Roadmap

`R0 Discovery` → `R1 Fundaciones` → `R2 Operación Core (MVP)` → `R3 Piloto` → `R4 ZESTIA` → `R5 Finanzas` → `R6 Escala`

## Desarrollo local

*Disponible a partir de R1.*

## Licencia

Todos los derechos reservados hasta definir licencia (ver issue de decisión).
