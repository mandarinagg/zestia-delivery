import { ApiError, api } from './api';
import { getSessionDeadlines, clearSessionDeadlines, sessionGeneration } from './session-clock';
import { OPERATOR, fakeApi } from '@/test/fake-api';

const withHeaders = (status: number, headers: Record<string, string>) =>
  new Response(status === 204 ? null : JSON.stringify({ statusCode: status, code: 'X' }), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
const REMAINING = { 'X-Session-Idle-Remaining': '600', 'X-Session-Absolute-Remaining': '900' };

describe('tiempo restante de la sesión en el cliente', () => {
  it('se registra también en un error de una sesión válida (404 de la API falsa)', async () => {
    fakeApi.reset({ as: OPERATOR });
    await expect(api('/no-existe')).rejects.toMatchObject({ status: 404 });
    expect(getSessionDeadlines()).not.toBeNull();
  });

  it('en un 403 se registra; en un 401 no', async () => {
    vi.stubGlobal('fetch', async () => withHeaders(403, REMAINING));
    await expect(api('/merchants')).rejects.toBeInstanceOf(ApiError);
    expect(getSessionDeadlines()).not.toBeNull();

    clearSessionDeadlines();
    vi.stubGlobal('fetch', async () => withHeaders(401, REMAINING));
    await expect(api('/merchants')).rejects.toMatchObject({ status: 401 });
    expect(getSessionDeadlines()).toBeNull();
  });

  it('una respuesta lenta de antes del logout no revive los vencimientos', async () => {
    let answer!: (r: Response) => void;
    vi.stubGlobal('fetch', () => new Promise<Response>((resolve) => (answer = resolve)));
    const pending = api('/auth/me');
    const started = sessionGeneration();

    clearSessionDeadlines(); // logout mientras el pedido vuela
    expect(sessionGeneration()).toBe(started + 1);
    answer(withHeaders(204, REMAINING));
    await pending;

    expect(getSessionDeadlines()).toBeNull();
  });
});
