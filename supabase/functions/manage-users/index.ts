import { createClient } from 'npm:@supabase/supabase-js@2.117.0';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const response = (status: number, value: unknown) => new Response(JSON.stringify(value), {
  status, headers: { ...cors, 'Content-Type': 'application/json' }
});
const url = Deno.env.get('SUPABASE_URL') || '';
const secretKeys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}');
const secret = secretKeys.default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
// Bound to the existing Auth user ID, not an editable email or client claim.
const ownerId = '25f4325b-18d1-40ba-9645-8fec15ea5855';
const roles = ['manager', 'board', 'admin'] as const;
const publicUrl = 'https://fc-dechsendorf.github.io/platzbelegung/';
function activationLink(actionLink: string, type: 'invite' | 'recovery', target: 'board' | 'calendar') {
  const verified = new URL(actionLink);
  if (verified.origin !== new URL(url).origin || verified.pathname !== '/auth/v1/verify')
    throw new Error('Unerwartetes Linkformat des Anmeldedienstes.');
  const token = verified.searchParams.get('token');
  if (!token || verified.searchParams.get('type') !== type)
    throw new Error('Einmallink ohne gültigen Bestätigungscode.');
  const activation = new URL(`${publicUrl}aktivieren.html`);
  // A URL fragment is not sent to GitHub Pages or link-preview crawlers.
  activation.hash = new URLSearchParams({ type, token_hash: token, target }).toString();
  return activation.toString();
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return response(200, {});
  if (request.method !== 'POST') return response(405, { error: 'Methode nicht erlaubt.' });
  if (!url || !secret) return response(503, { error: 'Serverkonfiguration fehlt.' });
  const authorization = request.headers.get('Authorization') || '';
  if (!authorization.startsWith('Bearer ')) return response(401, { error: 'Anmeldung erforderlich.' });
  const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: identity, error: identityError } =
    await admin.auth.getUser(authorization.slice(7));
  if (identityError || !identity.user) return response(401, { error: 'Sitzung ungültig.' });
  if (identity.user.app_metadata?.fcd_role !== 'admin')
    return response(403, { error: 'Administratorrechte erforderlich.' });

  let body: { action?: string; email?: string; role?: string; userId?: string };
  try { body = await request.json(); }
  catch { return response(400, { error: 'Ungültige Anfrage.' }); }
  if (body.action === 'list') {
    const users: { id: string; email: string; role: string; lastSignInAt: string | null; owner: boolean }[] = [];
    for (let page = 1; page <= 100; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
      if (error) return response(502, { error: error.message });
      users.push(...data.users.filter((user) => user.id === ownerId ||
        [...roles, 'disabled'].includes(user.app_metadata?.fcd_role))
        .map((user) => ({ id: user.id, email: user.email || '',
          role: user.app_metadata?.fcd_role || '', lastSignInAt: user.last_sign_in_at || null,
          owner: user.id === ownerId })));
      if (data.users.length < 100) break;
    }
    return response(200, { users, isOwner: identity.user.id === ownerId,
      managers: users.filter((user) => user.role === 'manager'),
      boardMembers: users.filter((user) => user.role === 'board') });
  }
  if (body.action === 'role' || body.action === 'disable' || body.action === 'recovery') {
    const userId = String(body.userId || '');
    if (!/^[0-9a-f-]{36}$/.test(userId)) return response(400, { error: 'Ungültiger Zugang.' });
    if (userId === ownerId) return response(403, { error: 'Der Hauptadministrator ist geschützt.' });
    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (error || !data.user) return response(404, { error: 'Zugang nicht gefunden.' });
    const target = data.user;
    const currentRole = target.app_metadata?.fcd_role;
    if (![...roles, 'disabled'].includes(currentRole))
      return response(403, { error: 'Dieser Zugang gehört nicht zur Platzbelegung.' });
    if (currentRole === 'admin' && identity.user.id !== ownerId)
      return response(403, { error: 'Administratoren verwaltet nur der Hauptadministrator.' });
    if (body.action === 'recovery') {
      if (currentRole === 'disabled') return response(409, { error: 'Gesperrte Zugänge erhalten keinen Link.' });
      const link = await admin.auth.admin.generateLink({ type: 'recovery',
        email: target.email || '', redirectTo: currentRole === 'board' ? `${publicUrl}statistik.html` : publicUrl });
      if (link.error || !link.data.properties?.action_link)
        return response(502, { error: link.error?.message || 'Link konnte nicht erstellt werden.' });
      const marked = await admin.auth.admin.updateUserById(userId, {
        user_metadata: { ...target.user_metadata, fcd_password_setup_pending: true }
      });
      if (marked.error) return response(502, { error: 'Passwortvergabe konnte nicht vorbereitet werden.' });
      try { return response(200, { actionLink: activationLink(link.data.properties.action_link,
        'recovery', currentRole === 'board' ? 'board' : 'calendar'), email: target.email }); }
      catch { return response(502, { error: 'Einmallink konnte nicht vorbereitet werden.' }); }
    }
    if (body.action === 'disable') {
      // Preserve audit references to auth.users; deny future logins and refreshes.
      const updated = await admin.auth.admin.updateUserById(userId, {
        ban_duration: '876000h', app_metadata: { ...target.app_metadata, fcd_role: 'disabled' }
      });
      return updated.error ? response(502, { error: updated.error.message }) : response(200, { ok: true });
    }
    if (!roles.includes(body.role as typeof roles[number]))
      return response(400, { error: 'Ungültige Rolle.' });
    if (body.role === 'admin' && identity.user.id !== ownerId)
      return response(403, { error: 'Nur der Hauptadministrator darf Administratorrechte vergeben.' });
    if (currentRole === 'disabled')
      return response(409, { error: 'Gesperrte Zugänge können nicht umgestellt werden.' });
    const updated = await admin.auth.admin.updateUserById(userId, {
      app_metadata: { ...target.app_metadata, fcd_role: body.role }
    });
    return updated.error ? response(502, { error: updated.error.message }) : response(200, { ok: true });
  }
  if (body.action !== 'invite') return response(400, { error: 'Unbekannte Aktion.' });
  const invitedRole = body.role || 'manager';
  if (!roles.includes(invitedRole as typeof roles[number]))
    return response(400, { error: 'Ungültige Zugangsrolle.' });
  if (invitedRole === 'admin' && identity.user.id !== ownerId)
    return response(403, { error: 'Nur der Hauptadministrator darf Administratoren einladen.' });
  const email = String(body.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
    return response(400, { error: 'Bitte eine gültige E-Mail-Adresse angeben.' });

  // The built-in Supabase mailer cannot reach external testers. Return a
  // single-use invite link only to the authenticated administrator instead.
  // Never let an invite mutate an already-established or protected account.
  for (let page = 1; page <= 100; page++) {
    const existing = await admin.auth.admin.listUsers({ page, perPage: 100 });
    if (existing.error) return response(502, { error: existing.error.message });
    if (existing.data.users.some((user) => user.email?.toLowerCase() === email))
      return response(409, { error: 'Adresse bereits vorhanden. Bitte den bestehenden Zugang verwalten.' });
    if (existing.data.users.length < 100) break;
  }
  const invitation = await admin.auth.admin.generateLink({
    type: 'invite', email,
    redirectTo: invitedRole === 'board' ? `${publicUrl}statistik.html` : publicUrl
  });
  if (invitation.error) return response(502, { error: invitation.error.message });
  const invited = invitation.data.user;
  if (!invited) return response(502, { error: 'Einladung konnte nicht geprüft werden.' });
  const metadata = { ...invited.app_metadata, fcd_role: invitedRole };
  const update = await admin.auth.admin.updateUserById(invited.id, {
    app_metadata: metadata,
    user_metadata: { ...invited.user_metadata, fcd_password_setup_pending: true }
  });
  if (update.error) return response(502, { error: update.error.message });
  const actionLink = invitation.data.properties?.action_link;
  if (!actionLink) return response(502, { error: 'Einladungslink wurde nicht bereitgestellt.' });
  try { return response(200, { email, invited: true, role: invitedRole,
    actionLink: activationLink(actionLink, 'invite', invitedRole === 'board' ? 'board' : 'calendar') }); }
  catch { return response(502, { error: 'Einmallink konnte nicht vorbereitet werden.' }); }
});
