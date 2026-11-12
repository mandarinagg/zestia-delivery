# Seguridad y privacidad

Referencia: **OWASP ASVS nivel 2** y OWASP Top 10. Para reportar vulnerabilidades del repositorio ver [`/SECURITY.md`](../SECURITY.md).

## Modelo de amenazas (principales)

| Amenaza | Control |
|---------|---------|
| Acceso cruzado entre tenants (IDOR) | Tenant resuelto en servidor + RLS + tests de aislamiento por endpoint |
| Escalada de privilegios | Guards por permiso en cada endpoint; matriz rol→permiso testeada |
| Repartidor accede a pedidos ajenos | Filtro por `Assignment` activo + test |
| Robo/abuso de API key | Hash en DB, prefijo visible, rotación, revocación, rate limit, `lastUsedAt` |
| Webhook falsificado / replay | HMAC-SHA256 + timestamp ± 5 min + `eventId` deduplicado |
| Pedidos duplicados | `Idempotency-Key` + único `(tenant, source, externalId)` |
| Enumeración de tracking links | Token ≥ 128 bits aleatorio, guardado hasheado, vencimiento, rate limit |
| Fuga de PII en logs | Redacción automática (pino redact), revisión en PR |
| Credenciales filtradas en repo | `.gitignore`, secret scanning de GitHub, gitleaks en CI |
| XSS / CSRF | React escapado por defecto, CSP estricta, cookies `HttpOnly; Secure; SameSite=Lax`, token CSRF en mutaciones con cookie |
| Fuerza bruta en login | Rate limit + backoff por cuenta/IP; 2FA TOTP |
| Soporte de plataforma abusivo | Acceso temporal con motivo, vencimiento, solo lectura en MVP, auditado y visible al tenant |

## Datos personales

- **Minimización:** del destinatario solo nombre, teléfono, dirección y referencias.
- El repartidor ve datos del destinatario **solo** mientras el pedido está asignado y activo.
- Retención configurable: anonimizar destinatario tras N meses (por defecto 12) [VALIDAR legal].
- Tracking público sin teléfono ni dirección completa.
- Exportaciones CSV auditadas.

## Operación

- Secretos en el gestor del proveedor (nunca en repo ni frontend); `.env.example` sin valores reales.
- TLS en todo; HSTS.
- Dependencias: Dependabot + `pnpm audit` en CI.
- Backups diarios cifrados, prueba de restauración mensual documentada.
- Auditoría append-only; acceso a auditoría solo Propietario/Admin.
