/**
 * DM Command Center — DM Authentication & Anti-Bruteforce Access Control
 * Default PIN: 0524
 */
(function () {
    const PATH = window.location.pathname.toLowerCase();
    
    // Only enforce DM PIN modal on DM-protected pages (/ or /index.html or /soundboard.html)
    const isDmPage = PATH === '/' || PATH.endsWith('/index.html') || PATH.endsWith('/soundboard.html');
    if (!isDmPage) return;

    let isLockedOut = false;
    let lockoutTimerInterval = null;

    function getSavedPasscode() {
        return localStorage.getItem('dm_passcode') || '';
    }

    function setSavedPasscode(code) {
        localStorage.setItem('dm_passcode', code);
    }

    async function verifyPasscodeOnServer(code) {
        try {
            const res = await fetch('/api/auth/verify-dm', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ passcode: code })
            });
            const data = await res.json();
            return { ok: res.ok, status: res.status, data };
        } catch (err) {
            console.error('[DM Auth] Error verifying passcode:', err);
            return { ok: false, status: 500, data: { error: 'Server communication error' } };
        }
    }

    // Attach passcode header to all fetch requests if available
    const originalFetch = window.fetch;
    window.fetch = function (resource, init) {
        init = init || {};
        init.headers = init.headers || {};
        const savedCode = getSavedPasscode();
        if (savedCode) {
            if (init.headers instanceof Headers) {
                init.headers.set('x-dm-passcode', savedCode);
            } else if (Array.isArray(init.headers)) {
                init.headers.push(['x-dm-passcode', savedCode]);
            } else {
                init.headers['x-dm-passcode'] = savedCode;
            }
        }
        return originalFetch.call(this, resource, init);
    };

    function injectDmAuthModal() {
        if (document.getElementById('dm-auth-modal-overlay')) return;

        const overlay = document.createElement('div');
        overlay.id = 'dm-auth-modal-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: rgba(7, 7, 10, 0.96);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            z-index: 999999;
            display: flex;
            align-items: center;
            justify-content: center;
            font-family: 'Inter', system-ui, -apple-system, sans-serif;
        `;

        overlay.innerHTML = `
            <div id="dm-auth-modal-card" style="
                background: #12121a;
                border: 1.5px solid #2d2d42;
                border-radius: 16px;
                padding: 36px 32px;
                width: 100%;
                max-width: 400px;
                text-align: center;
                box-shadow: 0 20px 50px rgba(0,0,0,0.8), 0 0 30px rgba(139, 92, 246, 0.15);
                box-sizing: border-box;
            ">
                <div style="font-size: 2.5rem; margin-bottom: 8px;">🛡️</div>
                <h2 style="font-family: 'Cinzel', Georgia, serif; color: #fbbf24; font-size: 1.4rem; margin: 0 0 8px 0;">DM Command Center</h2>
                <p style="color: #94a3b8; font-size: 0.85rem; margin-bottom: 24px;">Enter 4-digit DM PIN to unlock dashboard</p>
                
                <form id="dm-pin-form" onsubmit="return false;" style="margin-bottom: 16px;">
                    <div style="position: relative; margin-bottom: 16px;">
                        <input type="password" id="dm-pin-input" maxlength="8" autofocus placeholder="••••" style="
                            width: 100%;
                            padding: 14px 16px;
                            font-size: 1.8rem;
                            letter-spacing: 12px;
                            text-align: center;
                            background: #09090e;
                            border: 1.5px solid #3b3b54;
                            border-radius: 10px;
                            color: #f8fafc;
                            outline: none;
                            box-sizing: border-box;
                            font-family: monospace;
                            transition: border-color 0.2s, box-shadow 0.2s;
                        " />
                    </div>
                    <button type="submit" id="dm-pin-submit-btn" style="
                        width: 100%;
                        padding: 14px;
                        background: linear-gradient(135deg, #7c3aed, #6d28d9);
                        border: none;
                        border-radius: 10px;
                        color: #ffffff;
                        font-weight: 600;
                        font-size: 1rem;
                        cursor: pointer;
                        box-shadow: 0 4px 14px rgba(124, 58, 237, 0.4);
                        transition: transform 0.1s, opacity 0.2s;
                    ">Unlock Control Panel</button>
                </form>

                <div id="dm-pin-error-msg" style="
                    color: #ef4444;
                    font-size: 0.85rem;
                    min-height: 20px;
                    margin-top: 8px;
                    font-weight: 500;
                "></div>

                <div id="dm-pin-lockout-container" style="display: none; margin-top: 12px; color: #f59e0b; font-size: 0.85rem;">
                    🔒 Locked out due to too many failed attempts.<br/>
                    Try again in <span id="dm-lockout-timer" style="font-weight:bold; font-family:monospace;">15:00</span>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        const form = document.getElementById('dm-pin-form');
        const input = document.getElementById('dm-pin-input');
        const submitBtn = document.getElementById('dm-pin-submit-btn');
        const errorDiv = document.getElementById('dm-pin-error-msg');

        if (input) input.focus();

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (isLockedOut) return;

            const val = input.value.trim();
            if (!val) {
                errorDiv.textContent = 'Please enter a PIN.';
                return;
            }

            submitBtn.disabled = true;
            submitBtn.style.opacity = '0.6';
            errorDiv.textContent = '';

            const result = await verifyPasscodeOnServer(val);
            submitBtn.disabled = false;
            submitBtn.style.opacity = '1';

            if (result.ok && result.data.success) {
                setSavedPasscode(val);
                window.isDmAuthenticated = true;
                overlay.remove();
                console.log('[DM Auth] Authenticated successfully as DM.');
            } else if (result.status === 429) {
                startLockoutTimer(900); // 15 minutes lockout
                errorDiv.textContent = result.data.error || 'Too many attempts. Locked out for 15 minutes.';
            } else {
                input.value = '';
                if (input) input.focus();
                errorDiv.textContent = result.data.error || 'Invalid PIN.';
                shakeModal();
            }
        });
    }

    function shakeModal() {
        const card = document.getElementById('dm-auth-modal-card');
        if (!card) return;
        card.style.transform = 'translateX(-10px)';
        setTimeout(() => card.style.transform = 'translateX(10px)', 80);
        setTimeout(() => card.style.transform = 'translateX(-8px)', 160);
        setTimeout(() => card.style.transform = 'translateX(8px)', 240);
        setTimeout(() => card.style.transform = 'translateX(0)', 320);
    }

    function startLockoutTimer(durationSec) {
        isLockedOut = true;
        const input = document.getElementById('dm-pin-input');
        const submitBtn = document.getElementById('dm-pin-submit-btn');
        const lockoutContainer = document.getElementById('dm-pin-lockout-container');
        const timerSpan = document.getElementById('dm-lockout-timer');

        if (input) input.disabled = true;
        if (submitBtn) submitBtn.disabled = true;
        if (lockoutContainer) lockoutContainer.style.display = 'block';

        let remaining = durationSec;
        if (lockoutTimerInterval) clearInterval(lockoutTimerInterval);

        function updateDisplay() {
            const mins = Math.floor(remaining / 60);
            const secs = remaining % 60;
            if (timerSpan) {
                timerSpan.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
            }
        }

        updateDisplay();
        lockoutTimerInterval = setInterval(() => {
            remaining--;
            if (remaining <= 0) {
                clearInterval(lockoutTimerInterval);
                isLockedOut = false;
                if (input) input.disabled = false;
                if (submitBtn) submitBtn.disabled = false;
                if (lockoutContainer) lockoutContainer.style.display = 'none';
                if (input) input.focus();
            } else {
                updateDisplay();
            }
        }, 1000);
    }

    // Auto-verify saved passcode on page load
    async function checkInitialAuth() {
        const saved = getSavedPasscode();
        if (saved) {
            const res = await verifyPasscodeOnServer(saved);
            if (res.ok && res.data.success) {
                window.isDmAuthenticated = true;
                return; // Authenticated cleanly!
            }
        }
        // If no saved passcode or saved passcode is invalid/expired:
        injectDmAuthModal();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', checkInitialAuth);
    } else {
        checkInitialAuth();
    }
})();
