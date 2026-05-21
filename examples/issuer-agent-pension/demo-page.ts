import { escapeHtml } from './utils.ts';
import { listPensionCredentialOptions } from './credential-catalog.ts';

export function renderDemoPage(): string {
  const credentialOptions = listPensionCredentialOptions()
    .map(
      (option) =>
        `<option value="${escapeHtml(option.slug)}">${escapeHtml(option.label)}</option>`
    )
    .join('\n');

  return `<!DOCTYPE html>
<html lang="fi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Eläkeläistodiste — Kela demo</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600;700&display=swap" rel="stylesheet" />
  <style>
    :root {
      --kela-blue: #003580;
      --kela-blue-deep: #002070;
      --kela-accent: #009fe3;
      --kela-surface: #f4f7fb;
      --kela-border: #d8e2ef;
      --text: #1a2433;
      --text-muted: #5c6b7e;
      --success: #1a7f5a;
      --success-bg: #e8f7f1;
      --error: #b42318;
      --error-bg: #fef3f2;
      --authbound-navy: #041536;
      --radius: 8px;
      --shadow: 0 1px 2px rgba(0, 53, 128, 0.06), 0 8px 24px rgba(0, 53, 128, 0.08);
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      font-family: "Source Sans 3", system-ui, sans-serif;
      background: var(--kela-surface);
      color: var(--text);
      line-height: 1.5;
      min-height: 100dvh;
      display: flex;
      flex-direction: column;
    }
    a { color: var(--kela-accent); }
    .topbar {
      background: var(--kela-blue);
      color: #fff;
      padding: 0.75rem clamp(1rem, 4vw, 2.5rem);
      display: flex;
      align-items: center;
      gap: 1.5rem;
      flex-wrap: wrap;
    }
    .kela-lockup {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      text-decoration: none;
      color: inherit;
      flex-shrink: 0;
    }
    .kela-lockup img { display: block; height: 40px; width: auto; }
    .kela-lockup span {
      font-size: 0.75rem;
      font-weight: 400;
      opacity: 0.85;
      max-width: 12rem;
      line-height: 1.3;
    }
    .identity-picker {
      margin-left: auto;
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      min-width: min(100%, 300px);
    }
    .identity-picker label {
      font-size: 0.7rem;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      opacity: 0.8;
    }
    .identity-picker select {
      font: inherit;
      font-size: 0.9rem;
      padding: 0.5rem 0.65rem;
      border: 1px solid rgba(255,255,255,0.25);
      border-radius: 6px;
      background: rgba(255,255,255,0.12);
      color: #fff;
      width: 100%;
    }
    .identity-picker select option { color: var(--text); }
    .shell {
      flex: 1;
      width: min(920px, 100%);
      margin: 0 auto;
      padding: clamp(1rem, 3vw, 2rem);
    }
    .tabs {
      display: flex;
      gap: 0;
      border-bottom: 1px solid var(--kela-border);
      margin-bottom: 1.5rem;
    }
    .tab {
      background: none;
      border: none;
      border-bottom: 2px solid transparent;
      color: var(--text-muted);
      cursor: pointer;
      font: inherit;
      font-size: 0.95rem;
      font-weight: 600;
      padding: 0.75rem 1.25rem;
      margin-bottom: -1px;
      transition: color 0.15s, border-color 0.15s;
    }
    .tab:hover { color: var(--kela-blue); }
    .tab.active {
      border-bottom-color: var(--kela-accent);
      color: var(--kela-blue);
    }
    .page-head { margin-bottom: 1.25rem; }
    .page-head h1 {
      font-size: clamp(1.35rem, 3vw, 1.65rem);
      font-weight: 700;
      margin: 0 0 0.35rem;
      color: var(--kela-blue);
      letter-spacing: -0.02em;
    }
    .page-head p {
      margin: 0;
      color: var(--text-muted);
      font-size: 0.95rem;
      max-width: 38rem;
    }
    .card {
      background: #fff;
      border: 1px solid var(--kela-border);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      padding: clamp(1.25rem, 3vw, 1.75rem);
    }
    .card[hidden] { display: none !important; }
    .btn {
      appearance: none;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font: inherit;
      font-size: 0.95rem;
      font-weight: 700;
      padding: 0.7rem 1.25rem;
      width: 100%;
      transition: background 0.15s, transform 0.1s;
    }
    .btn:active:not(:disabled) { transform: scale(0.99); }
    .btn-primary {
      background: var(--kela-blue);
      color: #fff;
    }
    .btn-primary:hover:not(:disabled) { background: var(--kela-blue-deep); }
    .btn-primary:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
    .hint {
      color: var(--text-muted);
      font-size: 0.875rem;
      margin: 0 0 1rem;
    }
    .qr-stage {
      display: grid;
      gap: 1rem;
      justify-items: center;
      margin-top: 1.25rem;
      padding-top: 1.25rem;
      border-top: 1px solid var(--kela-border);
    }
    .qr-stage[hidden] { display: none !important; }
    .qr-frame {
      padding: 1rem;
      background: #fff;
      border: 1px solid var(--kela-border);
      border-radius: var(--radius);
    }
    .wallet-link {
      font-size: 0.85rem;
      word-break: break-all;
      text-align: center;
    }
    .meta-line {
      font-size: 0.8rem;
      color: var(--text-muted);
      font-variant-numeric: tabular-nums;
    }
    .verify-steps {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 1.25rem;
      flex-wrap: wrap;
    }
    .step-pill {
      font-size: 0.75rem;
      font-weight: 600;
      padding: 0.35rem 0.65rem;
      border-radius: 999px;
      background: #eef2f8;
      color: var(--text-muted);
      transition: background 0.2s, color 0.2s;
    }
    .step-pill.active {
      background: #e0eef8;
      color: var(--kela-blue);
    }
    .step-pill.done {
      background: var(--success-bg);
      color: var(--success);
    }
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      font-size: 0.8rem;
      font-weight: 600;
      padding: 0.35rem 0.65rem;
      border-radius: 999px;
      margin-bottom: 1rem;
    }
    .status-badge.waiting {
      background: #eef2f8;
      color: var(--kela-blue);
    }
    .status-badge.waiting::before {
      content: "";
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--kela-accent);
      animation: pulse 1.2s ease-in-out infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 0.35; transform: scale(0.85); }
      50% { opacity: 1; transform: scale(1); }
    }
    .success-panel {
      text-align: center;
      padding: 1.5rem 1rem 0.5rem;
      animation: rise-in 0.45s cubic-bezier(0.22, 1, 0.36, 1) forwards;
    }
    .success-panel[hidden] { display: none !important; }
    @keyframes rise-in {
      from { opacity: 0; transform: translateY(12px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .check-icon {
      width: 72px;
      height: 72px;
      margin: 0 auto 1rem;
      display: block;
      overflow: visible;
    }
    .check-icon .check-ring {
      fill: var(--success-bg);
      stroke: var(--success);
      stroke-width: 2;
      transform-origin: 24px 24px;
      animation: ring-in 0.35s cubic-bezier(0.22, 1, 0.36, 1) forwards;
    }
    .check-icon .check-mark {
      fill: none;
      stroke: var(--success);
      stroke-width: 3;
      stroke-linecap: round;
      stroke-linejoin: round;
      stroke-dasharray: 1;
      stroke-dashoffset: 1;
      animation: draw-check 0.45s 0.2s ease forwards;
    }
    @keyframes ring-in {
      from { opacity: 0; transform: scale(0.88); }
      to { opacity: 1; transform: scale(1); }
    }
    @keyframes draw-check { to { stroke-dashoffset: 0; } }
    .success-panel h2 {
      font-size: 1.25rem;
      font-weight: 700;
      margin: 0 0 0.35rem;
      color: var(--text);
    }
    .success-panel p {
      margin: 0 0 1rem;
      color: var(--text-muted);
      font-size: 0.9rem;
    }
    .result-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 0.65rem;
      text-align: left;
      margin: 1rem 0;
    }
    .result-cell {
      background: var(--kela-surface);
      border: 1px solid var(--kela-border);
      border-radius: 6px;
      padding: 0.65rem 0.75rem;
    }
    .result-cell dt {
      font-size: 0.65rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
      margin: 0 0 0.2rem;
    }
    .result-cell dd {
      margin: 0;
      font-size: 0.85rem;
      font-weight: 600;
      word-break: break-word;
    }
    .error-panel {
      background: var(--error-bg);
      border: 1px solid #fecdca;
      border-radius: var(--radius);
      color: var(--error);
      font-size: 0.85rem;
      padding: 0.85rem 1rem;
      margin-top: 1rem;
    }
    .error-panel[hidden] { display: none !important; }
    .issue-meta[hidden] { display: none !important; }
    .site-footer {
      margin-top: auto;
      background: var(--authbound-navy);
      color: rgba(255,255,255,0.75);
      padding: 1rem clamp(1rem, 4vw, 2.5rem);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      flex-wrap: wrap;
      font-size: 0.8rem;
    }
    .footer-powered {
      display: flex;
      align-items: center;
      gap: 0.65rem;
    }
    .footer-powered img {
      height: 22px;
      width: auto;
      display: block;
    }
    .footer-powered strong {
      color: #fff;
      font-weight: 700;
      letter-spacing: 0.02em;
    }
  </style>
</head>
<body>
  <header class="topbar">
    <a class="kela-lockup" href="https://www.kela.fi" target="_blank" rel="noopener noreferrer">
      <img src="/kela-logo.svg" width="96" height="40" alt="Kela" />
      <span>Kansaneläkelaitos · Pension credential demo</span>
    </a>
    <div class="identity-picker">
      <label for="credential-slug">Demo-henkilöllisyys</label>
      <select id="credential-slug" name="slug">
        <option value="">Valitse henkilöllisyys…</option>
        ${credentialOptions}
      </select>
    </div>
  </header>

  <div class="shell">
    <nav class="tabs" aria-label="Toiminnot">
      <button type="button" class="tab active" data-tab="issue">Myönnä todiste</button>
      <button type="button" class="tab" data-tab="verify">Vahvista todiste</button>
    </nav>

    <div class="page-head">
      <h1 id="hero-title">Lataa eläkeläistodiste</h1>
      <p id="hero-copy">Valitse demo-henkilöllisyys yläpalkista ja skannaa QR-koodi EU-lompakollasi.</p>
    </div>

    <section class="card" id="panel-issue">
      <p class="hint" id="issue-instructions">Valitse henkilöllisyys, sitten luo wallet-offer.</p>
      <button type="button" class="btn btn-primary" id="issue-button" disabled>Luo wallet-offer</button>
      <div class="qr-stage" id="issue-qr-stage" hidden>
        <div class="qr-frame"><canvas id="qrcode" width="256" height="256" aria-label="Issuance QR code"></canvas></div>
        <p class="wallet-link" id="issue-offer"></p>
        <p class="meta-line issue-meta" id="issue-meta" hidden></p>
      </div>
      <div class="error-panel" id="issue-error" hidden></div>
    </section>

    <section class="card" id="panel-verify" hidden>
      <div class="verify-steps" aria-hidden="true">
        <span class="step-pill active" data-step="1">1. Pyyntö</span>
        <span class="step-pill" data-step="2">2. Esitä</span>
        <span class="step-pill" data-step="3">3. Valmis</span>
      </div>
      <p class="hint" id="verify-hint">Aloita vahvistus ja skannaa QR-koodi lompakosta, jossa on eläketodiste.</p>
      <div class="status-badge waiting" id="verify-badge" hidden>Odotetaan lompakkoa</div>
      <button type="button" class="btn btn-primary" id="verify-button">Aloita vahvistus</button>
      <div class="qr-stage" id="verify-qr-stage" hidden>
        <div class="qr-frame"><canvas id="verify-qrcode" width="256" height="256" aria-label="Verification QR code"></canvas></div>
        <p class="wallet-link" id="verify-offer"></p>
      </div>
      <div class="success-panel" id="verify-success" hidden>
        <svg class="check-icon" viewBox="0 0 48 48" aria-hidden="true">
          <circle class="check-ring" cx="24" cy="24" r="21"/>
          <path class="check-mark" pathLength="1" d="M13 25.5 L20.5 33 L35.5 16.5"/>
        </svg>
        <h2>Todiste vahvistettu</h2>
        <p>Eläkeläistodiste vastasi pyyntöä. Alla tiivistelmä vahvistuksesta.</p>
        <dl class="result-grid" id="verify-result-grid"></dl>
        <button type="button" class="btn btn-primary" id="verify-reset" style="max-width:240px;margin:0 auto;">Uusi vahvistus</button>
      </div>
      <div class="error-panel" id="verify-error" hidden></div>
    </section>
  </div>

  <footer class="site-footer">
    <span>EU Digital Identity Wallet · OpenID4VCI / OpenID4VP</span>
    <div class="footer-powered">
      <span>Powered by</span>
      <img src="/authbound-wordmark.svg" width="140" height="22" alt="Authbound" />
    </div>
  </footer>

  <script>
    const tabs = document.querySelectorAll('.tab');
    const panelIssue = document.querySelector('#panel-issue');
    const panelVerify = document.querySelector('#panel-verify');
    const heroTitle = document.querySelector('#hero-title');
    const heroCopy = document.querySelector('#hero-copy');
    const slugSelect = document.querySelector('#credential-slug');
    const issueButton = document.querySelector('#issue-button');
    const issueInstructions = document.querySelector('#issue-instructions');
    const issueQrStage = document.querySelector('#issue-qr-stage');
    const issueCanvas = document.querySelector('#qrcode');
    const issueOffer = document.querySelector('#issue-offer');
    const issueMeta = document.querySelector('#issue-meta');
    const issueError = document.querySelector('#issue-error');
    const verifyButton = document.querySelector('#verify-button');
    const verifyHint = document.querySelector('#verify-hint');
    const verifyBadge = document.querySelector('#verify-badge');
    const verifyQrStage = document.querySelector('#verify-qr-stage');
    const verifyCanvas = document.querySelector('#verify-qrcode');
    const verifyOffer = document.querySelector('#verify-offer');
    const verifySuccess = document.querySelector('#verify-success');
    const verifyResultGrid = document.querySelector('#verify-result-grid');
    const verifyError = document.querySelector('#verify-error');
    const verifyReset = document.querySelector('#verify-reset');
    const stepPills = document.querySelectorAll('.step-pill');

    let activeVerificationId = null;
    let statusPollTimer = null;

    function setActiveTab(name) {
      for (const tab of tabs) {
        tab.classList.toggle('active', tab.dataset.tab === name);
      }
      panelIssue.hidden = name !== 'issue';
      panelVerify.hidden = name !== 'verify';
      if (name === 'issue') {
        heroTitle.textContent = 'Lataa eläkeläistodiste';
        heroCopy.textContent = 'Valitse demo-henkilöllisyys ja skannaa QR-koodi EU-lompakollasi.';
      } else {
        heroTitle.textContent = 'Vahvista eläkeläistodiste';
        heroCopy.textContent = 'Esitä eläketodiste lompakostasi vahvistusta varten.';
      }
    }

    for (const tab of tabs) {
      tab.addEventListener('click', () => setActiveTab(tab.dataset.tab));
    }

    slugSelect.addEventListener('change', () => {
      issueButton.disabled = !slugSelect.value;
      issueQrStage.hidden = true;
      issueError.hidden = true;
      if (!slugSelect.value) {
        issueInstructions.textContent = 'Valitse henkilöllisyys, sitten luo wallet-offer.';
      } else {
        issueInstructions.textContent =
          'Valmis myöntämään: ' + slugSelect.options[slugSelect.selectedIndex].textContent + '.';
      }
    });

    function setVerifyStep(step) {
      for (const pill of stepPills) {
        const n = Number(pill.dataset.step);
        pill.classList.remove('active', 'done');
        if (n < step) pill.classList.add('done');
        if (n === step) pill.classList.add('active');
      }
    }

    function showVerifyError(message) {
      verifyError.hidden = false;
      verifyError.textContent = message;
    }

    function clearVerifyError() {
      verifyError.hidden = true;
      verifyError.textContent = '';
    }

    function replayCheckAnimation() {
      const icon = verifySuccess.querySelector('.check-icon');
      if (!icon) return;
      for (const el of icon.querySelectorAll('.check-ring, .check-mark')) {
        el.style.animation = 'none';
      }
      void icon.getBoundingClientRect();
      for (const el of icon.querySelectorAll('.check-ring, .check-mark')) {
        el.style.animation = '';
      }
    }

    function resetVerifyUi() {
      stopPolling();
      activeVerificationId = null;
      verifyButton.hidden = false;
      verifyHint.hidden = false;
      verifyBadge.hidden = true;
      verifyQrStage.hidden = true;
      verifySuccess.hidden = true;
      clearVerifyError();
      setVerifyStep(1);
    }

    async function drawQr(canvas, uri) {
      const QR = window.QRCode;
      if (!QR?.QRCodeBrowser) throw new Error('QR library failed to load');
      const qr = QR.QRCodeBrowser(canvas);
      qr.setOptions({ text: uri, size: 256 });
      await qr.draw();
    }

    issueButton.addEventListener('click', async () => {
      const slug = slugSelect.value;
      if (!slug) return;
      issueButton.disabled = true;
      issueError.hidden = true;
      issueQrStage.hidden = true;
      issueInstructions.textContent = 'Luodaan offeria…';

      try {
        const response = await fetch('/offer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug }),
        });
        const body = await response.json();
        if (!response.ok) {
          issueError.hidden = false;
          issueError.textContent = body.message || JSON.stringify(body);
          return;
        }

        await drawQr(issueCanvas, body.offerUri);
        issueQrStage.hidden = false;
        issueOffer.innerHTML =
          '<a href="' + body.offerUri + '" target="_blank" rel="noopener">Avaa wallet-offer</a>';
        issueMeta.hidden = false;
        issueMeta.textContent = 'Offer ' + body.id + ' · ' + body.typeCode;
        issueInstructions.textContent = 'Skannaa QR-koodi lompakollasi.';
      } catch (error) {
        issueError.hidden = false;
        issueError.textContent = String(error);
      } finally {
        issueButton.disabled = !slugSelect.value;
      }
    });

    function stopPolling() {
      if (statusPollTimer) {
        clearInterval(statusPollTimer);
        statusPollTimer = null;
      }
    }

    function renderResultSummary(result) {
      verifyResultGrid.innerHTML = '';
      const items = [
        ['Status', result.status || 'verified'],
        ['Verification', result.verificationId || activeVerificationId || '—'],
      ];
      if (result.assertions && typeof result.assertions === 'object') {
        for (const [key, value] of Object.entries(result.assertions)) {
          if (value && typeof value === 'object' && !Array.isArray(value)) {
            for (const [k, v] of Object.entries(value)) {
              items.push([key + '.' + k, String(v)]);
            }
          } else {
            items.push([key, String(value)]);
          }
        }
      }
      for (const [label, value] of items.slice(0, 6)) {
        const dt = document.createElement('dt');
        dt.textContent = label;
        const dd = document.createElement('dd');
        dd.textContent = value;
        const cell = document.createElement('div');
        cell.className = 'result-cell';
        cell.append(dt, dd);
        verifyResultGrid.append(cell);
      }
    }

    async function pollVerificationStatus() {
      if (!activeVerificationId) return;
      const response = await fetch('/status?id=' + encodeURIComponent(activeVerificationId));
      const body = await response.json();
      if (!response.ok) {
        showVerifyError(body.message || JSON.stringify(body));
        stopPolling();
        resetVerifyUi();
        return;
      }

      const status = body.status;
      if (status === 'verified') {
        stopPolling();
        setVerifyStep(3);
        verifyBadge.hidden = true;
        verifyQrStage.hidden = true;
        verifyButton.hidden = true;
        verifyHint.hidden = true;

        const resultResponse = await fetch('/result?id=' + encodeURIComponent(activeVerificationId));
        const resultBody = await resultResponse.json();
        if (resultResponse.ok) {
          renderResultSummary(resultBody);
        }
        verifySuccess.hidden = false;
        replayCheckAnimation();
        return;
      }

      if (['failed', 'canceled', 'expired', 'timeout'].includes(status)) {
        stopPolling();
        showVerifyError('Vahvistus päättyi tilaan: ' + status);
        verifyBadge.hidden = true;
        return;
      }

      setVerifyStep(2);
      verifyBadge.hidden = false;
    }

    verifyButton.addEventListener('click', async () => {
      resetVerifyUi();
      verifyButton.disabled = true;
      clearVerifyError();

      try {
        const response = await fetch('/verify', { method: 'POST' });
        const body = await response.json();
        if (!response.ok) {
          showVerifyError(body.message || JSON.stringify(body));
          return;
        }

        activeVerificationId = body.verificationId;
        setVerifyStep(2);
        if (body.authorizationRequestUrl) {
          await drawQr(verifyCanvas, body.authorizationRequestUrl);
          verifyQrStage.hidden = false;
          verifyOffer.innerHTML =
            '<a href="' + body.authorizationRequestUrl + '" target="_blank" rel="noopener">Avaa vahvistuspyyntö</a>';
        }
        verifyBadge.hidden = false;
        verifyHint.textContent = 'Skannaa QR-koodi ja hyväksy esitys lompakossasi.';
        statusPollTimer = setInterval(pollVerificationStatus, 2000);
        await pollVerificationStatus();
      } catch (error) {
        showVerifyError(String(error));
      } finally {
        verifyButton.disabled = false;
      }
    });

    verifyReset.addEventListener('click', resetVerifyUi);
  </script>
  <script src="https://unpkg.com/@qrcode-js/browser"></script>
</body>
</html>`;
}
