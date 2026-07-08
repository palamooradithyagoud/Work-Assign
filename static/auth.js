// ──────────────────────────────────────────────
// AUTHENTICATION UTILS — ASSIGNIQ
// ──────────────────────────────────────────────

let currentUser = null;

async function checkSession() {
  try {
    const resp = await fetch("/api/auth/me");
    if (resp.ok) {
      currentUser = await resp.json();
      return currentUser;
    }
  } catch (e) {
    console.error("Auth check failed:", e);
  }
  currentUser = null;
  return null;
}

async function requireAuth() {
  const user = await checkSession();
  if (!user) {
    window.location.href = "/login";
  }
  return user;
}

async function requireGuest() {
  const user = await checkSession();
  if (user) {
    window.location.href = "/";
  }
}

async function signIn(email, password) {
  try {
    const resp = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    if (resp.ok) {
      currentUser = await resp.json();
      return { data: currentUser, error: null };
    } else {
      const errData = await resp.json();
      return { data: null, error: { message: errData.error || "Login failed" } };
    }
  } catch (e) {
    return { data: null, error: { message: "Server connection failed" } };
  }
}

async function signUp(email, password, fullName, role = "employee") {
  try {
    const resp = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, full_name: fullName, role })
    });
    if (resp.ok) {
      return { data: true, error: null };
    } else {
      const errData = await resp.json();
      return { data: null, error: { message: errData.error || "Signup failed" } };
    }
  } catch (e) {
    return { data: null, error: { message: "Server connection failed" } };
  }
}

async function signOut() {
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } catch (e) {
    console.error("Logout request failed:", e);
  }
  currentUser = null;
  window.location.href = "/login";
}
