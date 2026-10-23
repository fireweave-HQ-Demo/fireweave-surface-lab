"use client";

import { useState } from "react";
import { Button } from "../../components/Button";
import { COPY } from "../../lib/copy";
import { ERROR_CODES } from "../../lib/errors";

export default function LoginPage() {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);
    const form = new FormData(event.currentTarget);
    const res = await fetch("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
    });
    if (!res.ok) {
      setPending(false);
      setError(COPY.signInError);
      return;
    }
    window.location.href = "/inbox";
  }

  return (
    <div className="auth">
      <form className="auth-card" onSubmit={onSubmit}>
        <h1>Sign in</h1>
        <p className="auth-demo">staff@demo.clinic / password-demo-1</p>
        {error ? (
          <p className="banner error">
            {error}
            <span className="code">{ERROR_CODES.AUTH_FAILED}</span>
          </p>
        ) : null}
        <div>
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="username" required />
        </div>
        <div>
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
        <Button variant="primary" type="submit" loading={pending}>
          Sign in
        </Button>
        <div className="switch">
          <span className="muted">New clinic?</span>
          <a className="btn btn-ghost btn-md" href="/signup">
            Create a clinic
          </a>
        </div>
      </form>
    </div>
  );
}
