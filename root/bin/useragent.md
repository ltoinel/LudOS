---
name: useragent
desc: show your browser's user agent
alias: ua
demo: useragent
seo_title: What is my user agent? Browser & OS details
man: |
  # USERAGENT(1)

  ## NAME
  useragent — show your browser's user agent

  ## SYNOPSIS
  useragent

  ## DESCRIPTION
  Prints the User-Agent string your browser sends with every request,
  followed by a few details parsed from the modern User-Agent Client
  Hints API when available: the browser brand and version, the
  operating system platform, whether the device is mobile, and the
  preferred language.

  Everything is read locally from the `navigator` object — nothing is
  sent anywhere.

  ## HOW IT WORKS
  The User-Agent is the header string that identifies your browser, engine
  and operating system to every website. Because it is long and partly
  frozen for privacy, modern browsers also expose User-Agent Client Hints
  (navigator.userAgentData), a structured and more reliable source; the
  command shows both when available.

  ## USE CASES
  - tell a support team exactly which browser and version you use;
  - debug a site that serves a different page to your browser;
  - check what a privacy extension or a browser setting changes.

  ## PRIVACY
  Everything is read locally from your browser: nothing is sent or stored.

  ## EXAMPLES
  useragent

  ## SEE ALSO
  checkip, uname, whoami
js: |
  const E = ctx.escape;
  // One `Label: value` line, labels aligned in a 9-character column.
  const row = (label, value) =>
    ctx.append(
      `<div class="ln"><span class="accent" style="display:inline-block;min-width:9ch">${E(label)}</span><span class="comment">: </span><span class="out">${E(value)}</span></div>`,
    );

  // The raw User-Agent header, on its own wrapping line.
  const userAgent = navigator.userAgent || '(unavailable)';
  ctx.append(
    `<div class="ln out" style="white-space:pre-wrap;word-break:break-word">${E(userAgent)}</div>`,
  );

  // Richer, structured details from the User-Agent Client Hints API
  // (Chromium-based browsers); falls back to legacy `navigator` fields.
  const hints = navigator.userAgentData;
  // Browsers slip a decoy brand into the list ("Not.A/Brand", "Not A;Brand" …)
  // to keep sites from parsing it rigidly: leave it out.
  const DECOY_BRAND = /not.?a.?brand/i;
  const brands =
    hints && Array.isArray(hints.brands)
      ? hints.brands
          .filter((entry) => !DECOY_BRAND.test(entry.brand))
          .map((entry) => `${entry.brand} ${entry.version}`)
          .join(', ')
      : '';
  if (brands) row('Browser', brands);
  const platform = (hints && hints.platform) || navigator.platform || '';
  if (platform) row('Platform', platform);
  if (hints && typeof hints.mobile === 'boolean') row('Mobile', hints.mobile ? 'yes' : 'no');
  if (navigator.language) row('Language', navigator.language);
---
