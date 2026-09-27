---
name: password
desc: generate a strong random password — e.g. password 24, password -n 3 16
alias: pwgen
demo: password -n 3
seo_title: Password generator — strong, random, in your browser
man: |
  # PASSWORD(1)

  ## NAME
  password — generate strong random passwords

  ## SYNOPSIS
  password [options] [length]

  ## DESCRIPTION
  Generates passwords with the browser's cryptographically secure random
  source (crypto.getRandomValues). Characters are drawn without modulo
  bias (rejection sampling), and every enabled class — lowercase,
  uppercase, digits, symbols — appears at least once. Look-alike
  characters (0/O, 1/l/I) are left out. The length defaults to 20
  (min 8, max 128); the estimated entropy is shown below.

  Nothing is sent anywhere: the password exists only in this page.

  ## OPTIONS
  -n <count>      generate several passwords (max 20)
  --no-symbols    letters and digits only
  -c, --copy      copy the (last) password to the clipboard

  ## USE CASES
  - a new password for an account, to store in your password manager;
  - secrets for API keys, databases or Wi-Fi networks;
  - several candidates at once with -n, to pick the one you prefer.

  ## HOW STRONG IS IT?
  Entropy measures how hard a password is to guess: every extra bit doubles
  the work of a brute-force attack. The default 20 characters from a
  74-character alphabet give about 124 bits — far beyond what any attacker can
  brute-force. 80 bits already resists offline cracking; 128 bits matches a
  strong cryptographic key.

  ## EXAMPLES
  password
  password 32
  password -n 5 --no-symbols 16
  password -c 24

  ## SEE ALSO
  uuid, sha256sum, hashcat, qr
js: |
  const args = ctx.args.slice();
  let length = 20;
  let count = 1;
  let symbols = true;
  let copy = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-n') count = parseInt(args[++i], 10);
    else if (a === '--no-symbols') symbols = false;
    else if (a === '-c' || a === '--copy') copy = true;
    else if (/^\d+$/.test(a)) length = parseInt(a, 10);
    else { ctx.error(`password: unknown option ${a} — see man password`); return; }
  }
  if (!(length >= 8 && length <= 128)) { ctx.error('password: length must be between 8 and 128'); return; }
  if (!(count >= 1 && count <= 20)) { ctx.error('password: -n must be between 1 and 20'); return; }

  // Look-alikes (0 O 1 l I) are excluded to keep passwords easy to retype.
  const classes = [
    'abcdefghijkmnopqrstuvwxyz',
    'ABCDEFGHJKLMNPQRSTUVWXYZ',
    '23456789',
  ];
  if (symbols) classes.push('!#$%&*+-=?@^_~.:;');
  const alphabet = classes.join('');

  // Uniform integer in [0, n) — rejection sampling avoids the modulo bias of
  // `random % n` (values past the largest multiple of n are redrawn).
  const buf = new Uint32Array(1);
  const randomInt = (n) => {
    const limit = Math.floor(0x100000000 / n) * n;
    let x;
    do x = crypto.getRandomValues(buf)[0]; while (x >= limit);
    return x % n;
  };
  const pick = (set) => set[randomInt(set.length)];

  const generate = () => {
    // One guaranteed character per class, the rest from the full alphabet,
    // then a Fisher–Yates shuffle so the guaranteed ones land anywhere.
    const chars = classes.map(pick);
    while (chars.length < length) chars.push(pick(alphabet));
    for (let i = chars.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    return chars.join('');
  };

  let last = '';
  for (let i = 0; i < count; i++) {
    last = generate();
    ctx.raw(last);
  }
  const bits = Math.floor(length * Math.log2(alphabet.length));
  const grade = bits >= 128 ? 'excellent' : bits >= 80 ? 'strong' : 'fair';
  ctx.sysLine(`≈ ${bits} bits of entropy (${grade}) · ${alphabet.length}-char alphabet`);

  if (copy) {
    try {
      await navigator.clipboard.writeText(last);
      ctx.sysLine('copied to the clipboard');
    } catch {
      ctx.error('password: clipboard unavailable (permission denied?)');
    }
  }
---
