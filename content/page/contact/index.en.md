---
title: "Contact & Messages"
description: "Send a message to DEX Research. Corrections, collaboration, feedback, and inquiries are welcome."
date: 2026-09-30
slug: "contact"
---

## Get in touch

Use the form below to send a message. I read every submission and will reply when appropriate.

Typical topics:

- Report corrections or source suggestions
- Dataset feedback
- Research collaboration
- Sponsorship / partnership inquiries
- General questions about the methodology

<form action="https://api.web3forms.com/submit" method="POST" id="contact-form" style="max-width: 560px; margin-top: 1.5rem;">
  <!-- Replace YOUR_ACCESS_KEY with the key from https://web3forms.com -->
  <input type="hidden" name="access_key" value="YOUR_ACCESS_KEY">
  <input type="hidden" name="subject" value="New message from thedexs.com">
  <input type="hidden" name="from_name" value="DEX Research Contact Form">
  <input type="checkbox" name="botcheck" style="display: none;">

  <div style="margin-bottom: 1rem;">
    <label for="name" style="display: block; margin-bottom: 0.35rem; font-weight: 600;">Name</label>
    <input type="text" id="name" name="name" required placeholder="Your name"
      style="width: 100%; padding: 0.65rem 0.85rem; border-radius: 8px; border: 1px solid var(--card-border, #333); background: var(--card-background, #1a1a1a); color: inherit; box-sizing: border-box;">
  </div>

  <div style="margin-bottom: 1rem;">
    <label for="email" style="display: block; margin-bottom: 0.35rem; font-weight: 600;">Email</label>
    <input type="email" id="email" name="email" required placeholder="you@example.com"
      style="width: 100%; padding: 0.65rem 0.85rem; border-radius: 8px; border: 1px solid var(--card-border, #333); background: var(--card-background, #1a1a1a); color: inherit; box-sizing: border-box;">
  </div>

  <div style="margin-bottom: 1rem;">
    <label for="message" style="display: block; margin-bottom: 0.35rem; font-weight: 600;">Message</label>
    <textarea id="message" name="message" required rows="6" placeholder="Write your message here..."
      style="width: 100%; padding: 0.65rem 0.85rem; border-radius: 8px; border: 1px solid var(--card-border, #333); background: var(--card-background, #1a1a1a); color: inherit; box-sizing: border-box; resize: vertical;"></textarea>
  </div>

  <button type="submit"
    style="padding: 0.7rem 1.4rem; border-radius: 8px; border: none; background: #d4af37; color: #111; font-weight: 700; cursor: pointer;">
    Send Message
  </button>

  <p id="form-status" style="margin-top: 1rem; font-size: 0.95rem;"></p>
</form>

<script>
  const form = document.getElementById('contact-form');
  const status = document.getElementById('form-status');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    status.textContent = 'Sending...';
    status.style.color = 'inherit';
    const data = new FormData(form);
    try {
      const res = await fetch(form.action, {
        method: 'POST',
        body: data
      });
      const json = await res.json();
      if (json.success) {
        status.textContent = 'Message sent successfully. Thank you!';
        status.style.color = '#4ade80';
        form.reset();
      } else {
        status.textContent = json.message || 'Something went wrong. Please try again or email directly.';
        status.style.color = '#f87171';
      }
    } catch (err) {
      status.textContent = 'Network error. Please email dex222444@gmail.com instead.';
      status.style.color = '#f87171';
    }
  });
</script>

---

You can also reach me directly:

- **Email:** [dex222444@gmail.com](mailto:dex222444@gmail.com)
- **Proton Mail:** [qizhangdong325@proton.me](mailto:qizhangdong325@proton.me)
