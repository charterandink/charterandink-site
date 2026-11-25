// Sends Mike an alert email through Resend (resend.com).
// Env: RESEND_API_KEY (secret). Optional: NOTIFY_TO (default mike@charterandink.com),
// NOTIFY_FROM (default "Charter & Ink Website <alerts@charterandink.com>").
// Without RESEND_API_KEY it quietly does nothing, so the site keeps working.

export async function notify(env, { subject, text, replyTo }) {
  if (!env.RESEND_API_KEY) return;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: env.NOTIFY_FROM || "Charter & Ink Website <alerts@charterandink.com>",
        to: [env.NOTIFY_TO || "mike@charterandink.com"],
        subject,
        text,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
    });
    if (!res.ok) console.error("Resend", res.status, await res.text());
  } catch (e) {
    console.error("Resend failed", e);
  }
}
