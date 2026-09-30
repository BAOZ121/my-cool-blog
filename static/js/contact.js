/* Keep the native form as a fallback; enhanced submissions never retry automatically. */
(() => {
  const form = document.getElementById("contact-form");
  const status = document.getElementById("form-status");
  const button = form?.querySelector('button[type="submit"]');
  if (!form || !status || !button || form.dataset.contactEnhanced) return;
  form.dataset.contactEnhanced = "true";
  let pending = false;
  const setStatus = (state, message) => {
    status.dataset.state = state;
    status.textContent = message;
  };
  const draft = () => JSON.stringify(["name", "email", "message"].map(name => form.elements.namedItem(name)?.value || ""));

  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (pending || !form.reportValidity()) return;
    pending = true;
    const originalText = button.textContent;
    const originalDisabled = button.disabled;
    button.disabled = true;
    button.textContent = "Sending…";
    form.setAttribute("aria-busy", "true");
    setStatus("sending", "Sending your message…");
    const controller = new AbortController();
    let timeout;
    let timedOut = false;
    try {
      const submittedDraft = draft();
      const data = new FormData(form);
      const request = (async () => {
        const response = await fetch(form.action, { method: "POST", body: data, signal: controller.signal, headers: { Accept: "application/json" } });
        let payload;
        try { payload = await response.json(); } catch (error) {
          if (response.ok) throw error;
        }
        return { response, payload };
      })();
      // Racing also bounds a stalled response body, not only the initial connection.
      const deadline = new Promise((_, reject) => {
        timeout = setTimeout(() => {
          timedOut = true;
          controller.abort();
          reject(new Error("Submission timed out"));
        }, 20000);
      });
      const { response, payload } = await Promise.race([request, deadline]);
      if (response.ok && payload?.success === true) {
        const unchanged = draft() === submittedDraft;
        if (unchanged) form.reset();
        setStatus("success", unchanged ? "Message sent successfully. Thank you!" : "Message sent successfully. Your new edits are still here.");
      } else {
        const reason = typeof payload?.message === "string" ? payload.message.trim().slice(0, 350) : "Please try again later or use the email address below.";
        setStatus("rejected", `Your message was not accepted. ${reason} Your draft is still here.`);
      }
    } catch {
      setStatus(timedOut ? "timeout" : "error", timedOut
        ? "The message service took too long to respond. We could not confirm delivery. Your draft is still here; please check before resending or use the email address below."
        : "We could not confirm delivery. Your draft is still here; check your connection before resending or use the email address below.");
    } finally {
      clearTimeout(timeout);
      pending = false;
      form.setAttribute("aria-busy", "false");
      button.disabled = originalDisabled;
      button.textContent = originalText;
    }
  });
})();
