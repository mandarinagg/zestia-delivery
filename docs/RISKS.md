# Registro de riesgos

Probabilidad (P) e Impacto (I): 1 bajo – 3 alto. Severidad = P × I. Revisar en cada planning.

| # | Riesgo | P | I | Sev | Mitigación | Dueño |
|---|--------|---|---|-----|-----------|-------|
| R1 | Sin empresa piloto comprometida → producto sin validar | 2 | 3 | 6 | Conseguir piloto en R0 como gate; ofrecer piloto gratuito | PO |
| R2 | Fuga de datos entre tenants | 1 | 3 | 3 | RLS + tests de aislamiento obligatorios en CI | Tech lead |
| R3 | Contratos de ZESTIA distintos a lo supuesto | 3 | 2 | 6 | API genérica primero (ADR-010); auditoría en R0 | Tech lead |
| R4 | Alcance crece durante R2 (scope creep) | 3 | 2 | 6 | MVP congelado; cambios al backlog de R6 vía PO | PM |
| R5 | Repartidores no adoptan la PWA (conectividad, hábitos) | 2 | 3 | 6 | Prueba de campo en R0 con wireframes; PWA liviana y offline; capacitación en piloto | PO |
| R6 | Rendición de efectivo no refleja la realidad operativa | 2 | 3 | 6 | Mapear el proceso actual en discovery; piloto en paralelo | PO |
| R7 | Capacidad del equipo menor a la supuesta | 2 | 2 | 4 | Roadmap recalculable; priorización estricta P0/P1 | PM |
| R8 | Incumplimiento normativo de datos personales | 1 | 3 | 3 | Consulta legal en R0; minimización y retención | PO |
| R9 | Costos de infraestructura/terceros (mapas, WhatsApp API) | 2 | 1 | 2 | Sin mapas ni WhatsApp API en MVP; ADR-013 con presupuesto | PM |
| R10 | Repo público expone información sensible | 1 | 2 | 2 | Secret scanning, gitleaks, revisión de PR, sin datos reales en seeds | Tech lead |
| R11 | Fiestas de fin de año reducen disponibilidad de entrevistas y equipo | 3 | 1 | 3 | Planificar entrevistas en noviembre; buffer de 2 semanas | PM |
