import { OMK_BASE } from "./config.js";

const STORAGE_KEY = "flux-conceptuel-auth";

export async function login(email, keyIdentity, keyCredential) {
  const url = `${OMK_BASE}/api/users?email=${encodeURIComponent(email)}`
    + `&key_identity=${encodeURIComponent(keyIdentity)}&key_credential=${encodeURIComponent(keyCredential)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`login: HTTP ${res.status}`);
  const users = await res.json();
  const user = Array.isArray(users) ? users[0] : null;
  if (!user) return null;

  const auth = {
    email,
    keyIdentity,
    keyCredential,
    name: user["o:name"],
    role: user["o:role"],
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
  return auth;
}

export function logout() {
  localStorage.removeItem(STORAGE_KEY);
}

export function getAuth() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

export function authQuery(auth) {
  return `key_identity=${encodeURIComponent(auth.keyIdentity)}&key_credential=${encodeURIComponent(auth.keyCredential)}`;
}
