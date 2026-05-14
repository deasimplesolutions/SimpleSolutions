// Simple Solutions — auth wrapper around Supabase Auth
// Real accounts that sync across devices, persist forever, and work over the web.
//
// SETUP: After creating your Supabase project, paste the values from
// Project Settings → API into the two constants below. Both are safe to
// expose in client code (the anon key is public by design — your data is
// protected by Row Level Security inside Supabase, not by hiding the key).

(function (global) {
  // ── Supabase project credentials (anon key is safe to expose) ───
  const SUPABASE_URL      = 'https://fwinnjaoaiopnriykqzb.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ3aW5uamFvYWlvcG5yaXlrcXpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3Mjc2NDAsImV4cCI6MjA5NDMwMzY0MH0.5yxUmBHLo2LaJuPqNpoy4OQcvKM9mwCXl3_bhjQi-us';
  // ────────────────────────────────────────────────────────────────

  if (!global.supabase || typeof global.supabase.createClient !== 'function') {
    console.error('[SSCAuth] Supabase JS SDK not loaded. Add this BEFORE auth.js:\n  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>');
    global.SSCAuth = brokenStub('Supabase SDK missing.');
    return;
  }

  if (SUPABASE_URL.includes('YOUR-PROJECT-REF') || SUPABASE_ANON_KEY.includes('YOUR-ANON')) {
    console.error('[SSCAuth] Supabase credentials not set. Edit auth.js — paste your Project URL and anon key from Supabase → Project Settings → API.');
    global.SSCAuth = brokenStub('Auth not configured. See console.');
    return;
  }

  const sb = global.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function isValidUsername(username) {
    return /^[a-zA-Z0-9_.-]{3,20}$/.test(username);
  }

  function passwordIssues(password) {
    const issues = [];
    if (!password || password.length < 8) issues.push('at least 8 characters');
    if (!/[A-Z]/.test(password || '')) issues.push('an uppercase letter');
    if (!/[a-z]/.test(password || '')) issues.push('a lowercase letter');
    if (!/[0-9]/.test(password || '')) issues.push('a number');
    return issues;
  }

  async function signUp({ firstName, lastName, email, username, password, confirmPassword }) {
    firstName = (firstName || '').trim();
    lastName  = (lastName  || '').trim();
    email     = (email     || '').trim().toLowerCase();
    username  = (username  || '').trim();

    if (!firstName) return { ok: false, error: 'First name is required.' };
    if (!lastName)  return { ok: false, error: 'Last name is required.' };
    if (!isValidEmail(email)) return { ok: false, error: 'Please enter a valid email address.' };
    if (!isValidUsername(username)) {
      return { ok: false, error: 'Username must be 3-20 characters and contain only letters, numbers, dots, dashes, or underscores.' };
    }
    const pwIssues = passwordIssues(password);
    if (pwIssues.length) {
      return { ok: false, error: 'Password needs ' + pwIssues.join(', ') + '.' };
    }
    if (password !== confirmPassword) {
      return { ok: false, error: 'Passwords do not match.' };
    }

    const { data, error } = await sb.auth.signUp({
      email,
      password,
      options: {
        data: { firstName, lastName, username },
        emailRedirectTo: global.location.origin + '/dashboard.html'
      }
    });

    if (error) {
      return { ok: false, error: friendlyAuthError(error) };
    }

    if (!data.session) {
      return {
        ok: true,
        user: data.user ? publicUser(data.user) : null,
        needsEmailConfirm: true,
        message: 'Check your inbox for a confirmation link from Supabase. Click it to finish creating your account.'
      };
    }
    return { ok: true, user: publicUser(data.user) };
  }

  async function logIn({ identifier, password }) {
    identifier = (identifier || '').trim().toLowerCase();
    if (!identifier) return { ok: false, error: 'Please enter your email.' };
    if (!password)   return { ok: false, error: 'Please enter your password.' };
    if (!isValidEmail(identifier)) {
      return { ok: false, error: 'Please use the email you signed up with.' };
    }

    const { data, error } = await sb.auth.signInWithPassword({
      email: identifier,
      password
    });

    if (error) {
      return { ok: false, error: friendlyAuthError(error) };
    }
    return { ok: true, user: publicUser(data.user) };
  }

  function friendlyAuthError(error) {
    const msg = (error && error.message) || '';
    if (/email not confirmed/i.test(msg)) {
      return 'Please confirm your email first. Check your inbox for the link from Supabase.';
    }
    if (/invalid login credentials/i.test(msg)) {
      return 'Incorrect email or password.';
    }
    if (/already registered/i.test(msg) || /already exists/i.test(msg)) {
      return 'An account with that email already exists. Try logging in instead.';
    }
    return msg || 'Something went wrong. Please try again.';
  }

  function publicUser(user) {
    if (!user) return null;
    const m = user.user_metadata || {};
    return {
      id: user.id,
      firstName: m.firstName || '',
      lastName:  m.lastName  || '',
      email:     user.email,
      username:  m.username  || '',
      createdAt: user.created_at
    };
  }

  let cachedUser = null;
  let initPromise = null;

  function init() {
    if (initPromise) return initPromise;
    initPromise = (async () => {
      const { data } = await sb.auth.getSession();
      cachedUser = data?.session?.user ? publicUser(data.session.user) : null;
      sb.auth.onAuthStateChange((_event, session) => {
        cachedUser = session?.user ? publicUser(session.user) : null;
      });
      return cachedUser;
    })();
    return initPromise;
  }

  function getCurrentUser() {
    return cachedUser;
  }

  async function getCurrentUserAsync() {
    await init();
    return cachedUser;
  }

  async function logOut() {
    await sb.auth.signOut();
    cachedUser = null;
  }

  async function requireAuth(redirectTo) {
    await init();
    if (!cachedUser) {
      global.location.href = redirectTo || 'login.html';
      return false;
    }
    return true;
  }

  function brokenStub(reason) {
    const err = { ok: false, error: reason };
    return {
      signUp:              async () => err,
      logIn:               async () => err,
      logOut:              async () => {},
      getCurrentUser:      () => null,
      getCurrentUserAsync: async () => null,
      requireAuth:         async (r) => { global.location.href = r || 'login.html'; return false; },
      passwordIssues
    };
  }

  init();

  global.SSCAuth = {
    signUp,
    logIn,
    logOut,
    getCurrentUser,
    getCurrentUserAsync,
    requireAuth,
    passwordIssues,
    init,
    _supabase: sb
  };
})(window);
