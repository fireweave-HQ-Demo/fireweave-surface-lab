"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "../../components/Button";
import { COPY } from "../../lib/copy";
import { ERROR_CODES } from "../../lib/errors";

function slugFor(name: string) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32) || "clinic";
  return `${base}-${Math.random().toString(36).slice(2, 6)}`;
}

async function message(res: Response, fallback: string) {
  const body = (await res.json().catch(() => ({}))) as { message?: string };
  return body.message ?? fallback;
}

const steps = ["Clinic created", "GI rules loaded", "Approve all set"];

export default function SignupPage() {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(0);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);
    setDone(0);
    const form = new FormData(event.currentTarget);
    const clinic = String(form.get("clinic") ?? "").trim();
    const name = String(form.get("name") ?? "").trim();
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");
    const signUp = await fetch("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });
    if (!signUp.ok) {
      setPending(false);
      setError(await message(signUp, COPY.signUpError));
      return;
    }
    setDone(1);
    const org = await fetch("/api/auth/organization/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: clinic, slug: slugFor(clinic) }),
    });
    if (!org.ok) {
      setPending(false);
      setError(await message(org, COPY.clinicError));
      return;
    }
    setDone(3);
    window.location.href = "/inbox";
  }

  return (
    <div className="auth">
      <form className="auth-card" onSubmit={onSubmit}>
        <h1>Create a clinic</h1>
        {error ? (
          <p className="banner error">
            {error}
            <span className="code">{ERROR_CODES.AUTH_FAILED}</span>
          </p>
        ) : null}
        <div>
          <label htmlFor="clinic">Clinic name</label>
          <input id="clinic" name="clinic" type="text" autoComplete="organization" required />
        </div>
        <div>
          <label htmlFor="specialty">Specialty</label>
          <input id="specialty" name="specialty" type="text" defaultValue="GI" />
        </div>
        <div>
          <label htmlFor="name">Your name</label>
          <input id="name" name="name" type="text" autoComplete="name" required />
        </div>
        <div>
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="username" required />
        </div>
        <div>
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
        </div>
        {pending || done > 0 ? (
          <ol className="progress">
            {steps.map((label, index) => (
              <li key={label} className={done > index ? "on" : ""}>
                {label}
              </li>
            ))}
          </ol>
        ) : null}
        <Button variant="primary" type="submit" loading={pending}>
          Create clinic
        </Button>
        <div className="switch">
          <span className="muted">Already have a desk?</span>
          <Link className="btn btn-ghost btn-md" href="/login">
            Sign in
          </Link>
        </div>
      </form>
    </div>
  );
}
