#!/bin/sh
# Crea los roles de base de datos de ZESTIA DELIVERY (ver docs/ARCHITECTURE.md, "Multi-tenancy").
# Lo ejecuta la imagen oficial de Postgres una sola vez, al inicializar un volumen vacío,
# como el superusuario de bootstrap ($POSTGRES_USER). También lo usan los tests de integración
# (Testcontainers), así el entorno de tests replica el de desarrollo.
#
#   zestia_migrator  dueño de la base y del esquema `public`; corre las migraciones.
#                    Sin SUPERUSER ni BYPASSRLS (las tablas usan FORCE ROW LEVEL SECURITY,
#                    así que tampoco el dueño se saltea las políticas). CREATEDB solo para la
#                    shadow database de `prisma migrate dev`.
#   zestia_app       el único rol con el que se conecta la API. No es dueño de nada,
#                    sin SUPERUSER, sin BYPASSRLS, sin CREATEDB/CREATEROLE. Recibe solo los
#                    GRANT explícitos de cada migración.
set -eu

: "${ZESTIA_MIGRATOR_PASSWORD:?ZESTIA_MIGRATOR_PASSWORD es obligatorio}"
: "${ZESTIA_APP_PASSWORD:?ZESTIA_APP_PASSWORD es obligatorio}"

# psql interpola las variables (:'x' literal, :"x" identificador) con el escape correcto;
# el heredoc va entre comillas para que el shell no toque su contenido.
psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v db="$POSTGRES_DB" \
  -v migrator_password="$ZESTIA_MIGRATOR_PASSWORD" \
  -v app_password="$ZESTIA_APP_PASSWORD" <<'EOSQL'
CREATE ROLE zestia_migrator
  LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOREPLICATION CREATEDB
  PASSWORD :'migrator_password';

CREATE ROLE zestia_app
  LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOREPLICATION NOCREATEDB
  PASSWORD :'app_password';

-- El migrador es dueño de la base y, por pg_database_owner, del esquema public.
ALTER DATABASE :"db" OWNER TO zestia_migrator;
REVOKE ALL ON DATABASE :"db" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"db" TO zestia_app;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
EOSQL
