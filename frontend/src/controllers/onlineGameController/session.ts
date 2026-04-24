import { decodeJwt } from '../../utils/ui';

export function getSession() {
  const token = sessionStorage.getItem('access_token');
  const pid = sessionStorage.getItem('player_id');
  if (!token || !pid) return null;
  const decoded = decodeJwt(token);
  return { token, player_id: Number(pid), username: sessionStorage.getItem('username') || decoded?.username || `p${pid}` };
}
