import { getRouteApi } from '@tanstack/react-router';
import { CompanyPage } from './company-page';
import { LoginPage } from './login-page';

const login = getRouteApi('/ingreso');
const company = getRouteApi('/ingreso/empresa');

/** Adaptadores de ruta: leen search/contexto y renderizan la pantalla. */
export function LoginRoute() {
  const { redirect, reason } = login.useSearch();
  return <LoginPage redirect={redirect} reason={reason} />;
}

export function CompanyRoute() {
  const { redirect } = company.useSearch();
  const { session } = company.useRouteContext();
  return <CompanyPage session={session} redirect={redirect} />;
}
