export function pdfFiles(list: FileList | File[] | null | undefined) {
  return Array.from(list ?? []).filter((file) => file.type === "application/pdf" || /\.pdf$/i.test(file.name));
}

export async function postReferral(file: File) {
  const form = new FormData();
  form.set("file", file);
  const res = await fetch("/api/referrals", { method: "POST", body: form });
  const body = (await res.json().catch(() => ({}))) as { referralId?: string; duplicate?: boolean };
  return { ok: res.ok, ...body };
}
