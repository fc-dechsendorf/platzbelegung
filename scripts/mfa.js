/* Personal MFA. Secrets/codes are displayed only in this browser, never persisted locally. */
(() => {
  let active = null;
  let settingsBusy = false;
  const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const check = result => { if (result.error) throw new Error(result.error.message); return result.data; };
  const cloud = () => window.Cloud;
  function dialog(title, content, submit) {
    return new Promise((resolve, reject) => {
      const panel = document.createElement('dialog');
      panel.style.cssText = 'max-width:560px;width:calc(100% - 40px);max-height:90vh;overflow:auto;padding:24px;border:1px solid #888;border-radius:12px;background:#fff;color:#17212b;font:16px/1.5 system-ui;z-index:99999';
      panel.innerHTML = `<form><h2>${esc(title)}</h2>${content}<p role="alert" style="color:#a00" data-error></p><button type="submit">Bestätigen</button> <button type="button" data-cancel>Abbrechen</button></form>`;
      document.body.append(panel); panel.showModal();
      const recoverySwitch = panel.querySelector('[name=recover]');
      if (recoverySwitch) recoverySwitch.onchange = () => {
        panel.querySelector('[name=code]').disabled = recoverySwitch.checked;
      };
      const close = () => { panel.close(); panel.remove(); };
      const cancel = () => { close(); reject(new Error('MFA-Vorgang abgebrochen.')); };
      panel.addEventListener('cancel', event => { event.preventDefault(); cancel(); });
      panel.querySelector('[data-cancel]').onclick = cancel;
      panel.querySelector('form').onsubmit = async event => {
        event.preventDefault(); const button = panel.querySelector('[type=submit]'); button.disabled = true;
        try { const result = await submit(new FormData(event.target), panel); close(); resolve(result); }
        catch (error) { panel.querySelector('[data-error]').textContent = error.message; button.disabled = false; }
      };
    });
  }
  const codeField = '<label>Code aus der Authenticator-App<br><input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required autofocus></label>';
  async function factors() { return check(await cloud().client.auth.mfa.listFactors()).totp.filter(f => f.status === 'verified'); }
  async function verify(factorId, code) { check(await cloud().client.auth.mfa.challengeAndVerify({ factorId, code })); }
  async function saveCodes() {
    let codes = (await cloud().websiteMfa('codes')).codes;
    try {
      await dialog('Wiederherstellungscodes sichern', `<p>Diese zehn Codes werden nur jetzt angezeigt. Jeder Code ist einmal verwendbar. Ein neuer Satz ersetzt sämtliche bisherigen Codes.</p><pre style="white-space:pre-wrap;user-select:all">${codes.map(esc).join('\n')}</pre><p>Bewahre sie sicher außerhalb deines Smartphones auf, zum Beispiel als Ausdruck.</p><label><input name="saved" type="checkbox" required> Ich habe die Codes unabhängig gespeichert.</label>`, async () => {
        await cloud().websiteMfa('activate');
      });
    } finally { codes = null; }
  }
  async function enroll() {
    const existing = check(await cloud().client.auth.mfa.listFactors());
    // Remove only abandoned unverified enrollments belonging to this user.
    for (const factor of existing.all.filter(f => f.factor_type === 'totp' && f.status === 'unverified'))
      check(await cloud().client.auth.mfa.unenroll({ factorId: factor.id }));
    const enrolled = check(await cloud().client.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Vereinswebsite', issuer: 'FC Dechsendorf' }));
    let verified = false;
    try {
      await dialog('Authenticator-App einrichten', `<p>Scanne den QR-Code mit deiner App. Gib danach den angezeigten sechsstelligen Code ein.</p><img style="max-width:240px" alt="QR-Code für deine Authenticator-App" src="${esc(enrolled.totp.qr_code)}"><details><summary>Manueller Einrichtungsschlüssel</summary><code>${esc(enrolled.totp.secret)}</code></details><p>Gib QR-Code und Schlüssel nicht weiter.</p>${codeField}`, async form => {
        await verify(enrolled.id, String(form.get('code'))); verified = true;
      });
    } finally {
      if (!verified) await cloud().client.auth.mfa.unenroll({ factorId: enrolled.id });
    }
    await saveCodes();
  }
  async function recovery() {
    await dialog('Zugang mit Recovery-Code wiederherstellen', '<p>Dein Passwort und ein unbenutzter Wiederherstellungscode setzen die verlorene App zurück. Danach musst du eine neue App einrichten und neue Codes sichern. Bis dahin bleibt die Verwaltung gesperrt.</p><label>Passwort<br><input name="password" type="password" autocomplete="current-password" required></label><p><label>Wiederherstellungscode<br><input name="recovery" autocomplete="off" required></label></p>', async form => {
      await cloud().websiteMfa('recover', { password: String(form.get('password')), code: String(form.get('recovery')) });
      check(await cloud().client.auth.refreshSession());
    });
    await enroll();
  }
  async function challenge(status) {
    const available = await factors();
    if (status?.recovering) return enroll();
    if (!available.length) return recovery();
    const recover = await dialog('Anmeldung bestätigen', `${codeField}<p><label><input type="checkbox" name="recover"> App verloren – stattdessen Recovery-Code verwenden</label></p>`, async (form, panel) => {
      if (form.get('recover')) return true;
      await verify(available[0].id, String(form.get('code'))); return false;
    });
    if (recover) await recovery();
  }
  async function authenticate(status) {
    if (active) return active;
    active = challenge(status);
    try { await active; } finally { active = null; }
  }
  function mount(status) {
    if (!document.getElementById('website-mfa-settings')) {
      const button = document.createElement('button'); button.id = 'website-mfa-settings'; button.textContent = 'Meine Kontosicherheit';
      button.style.cssText = 'position:fixed;bottom:12px;right:12px;z-index:9000;padding:8px 12px';
      document.body.append(button);
      button.onclick = async () => {
        settingsBusy = true;
        try {
          const current = await cloud().websiteMfa('status');
          const enrolled = await factors();
          if (current.blocked) await authenticate(current);
          else if (!enrolled.length) await enroll();
          else {
            if (!current.strong) await authenticate(current);
            await saveCodes();
          }
          location.reload();
        } catch (error) { alert(error.message); }
        finally { settingsBusy = false; }
      };
    }
    if (status?.blocked && !active) authenticate(status).then(async () => {
      await cloud().initializeMfaSession(); location.reload();
    }).catch(() => {});
  }
  window.WebsiteMFA = { mount, authenticate, get busy() { return settingsBusy || Boolean(active); } };
})();
