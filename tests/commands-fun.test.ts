import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runCommand } from './run-command.ts';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** A `fetch` stand-in answering every call with a fresh JSON response. */
function stubJsonFetch(payload: unknown, init: ResponseInit = {}) {
  const fetchMock = vi.fn<(url: string, options?: RequestInit) => Promise<Response>>(
    async () =>
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'content-type': 'application/json' },
        ...init,
      }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** A `fetch` stand-in failing the way a browser does for CORS or no network. */
function stubFailingFetch() {
  const fetchMock = vi.fn(async () => {
    throw new TypeError('Failed to fetch');
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('cowsay', () => {
  it('draws a one-line bubble above the cow', async () => {
    const { out } = await runCommand('cowsay', ['hi']);
    const lines = out[0].split('\n');
    expect(lines.slice(0, 3)).toEqual([' .--.', '< hi >', " '--'"]);
    // The trail starts right under the bubble and leads to the cow.
    expect(lines[3].trim()).toBe('\\');
    expect(out[0]).toContain('(\\____/)');
    expect(out[0]).toContain('( o  o )');
  });

  it('wraps at 40 columns with rounded multi-line borders', async () => {
    const text = 'the quick brown fox jumps over the lazy dog and keeps running far away';
    const { out } = await runCommand('cowsay', text.split(' '));
    const lines = out[0].split('\n');
    const bottom = lines.findIndex((line) => line.startsWith(" '"));
    const rows = lines.slice(1, bottom);
    expect(rows.length).toBeGreaterThan(1);
    // Every row has the same width: text (<= 40) + two borders + two spaces.
    expect(new Set(rows.map((row) => row.length)).size).toBe(1);
    expect(rows[0].length).toBeLessThanOrEqual(44);
    expect(rows[0].startsWith('/ ')).toBe(true);
    expect(rows[0].endsWith(' \\')).toBe(true);
    expect(rows[rows.length - 1].startsWith('\\ ')).toBe(true);
    expect(rows[rows.length - 1].endsWith(' /')).toBe(true);
    expect(lines[0].length).toBe(rows[0].length - 1);
    // Nothing is lost by the wrapping.
    const said = rows.map((row) => row.slice(2, -2).trim()).join(' ');
    expect(said).toBe(text);
  });

  it('uses | borders for the middle rows and cuts over-long words', async () => {
    const { out } = await runCommand('cowsay', ['x'.repeat(100)]);
    const rows = out[0].split('\n').slice(1, 4);
    expect(rows[0]).toBe(`/ ${'x'.repeat(40)} \\`);
    expect(rows[1]).toBe(`| ${'x'.repeat(40)} |`);
    expect(rows[2]).toBe(`\\ ${'x'.repeat(20).padEnd(40)} /`);
  });

  it('thinks with -t: round borders and a dotted trail', async () => {
    const { out } = await runCommand('cowsay', ['-t', 'hmm']);
    const lines = out[0].split('\n');
    expect(lines[1]).toBe('( hmm )');
    expect(lines[3].trim()).toBe('o');
  });

  it('takes custom eyes, even ones that look like placeholders', async () => {
    expect((await runCommand('cowsay', ['-e', '^^', 'hi'])).out[0]).toContain('( ^  ^ )');
    expect((await runCommand('cowsay', ['-e', 'x', 'hi'])).out[0]).toContain('( x  x )');
    expect((await runCommand('cowsay', ['-e', '21', 'hi'])).out[0]).toContain('( 2  1 )');
  });

  it('lists and draws the other animals', async () => {
    const list = (await runCommand('cowsay', ['-l'])).out[0];
    for (const animal of ['cow', 'cat', 'owl', 'robot']) expect(list).toContain(animal);
    expect((await runCommand('cowsay', ['-f', 'cat', 'purr'])).out[0]).toContain('/  o  o  \\');
    expect((await runCommand('cowsay', ['-f', 'owl', 'hoo'])).out[0]).toContain('( (o)(o) )');
    expect((await runCommand('cowsay', ['-f', 'robot', 'beep'])).out[0]).toContain('|[o o]|');
    // No placeholder survives in any drawing.
    for (const animal of ['cow', 'cat', 'owl', 'robot']) {
      const drawing = (await runCommand('cowsay', ['-f', animal, 'a'])).out[0];
      expect(drawing).not.toMatch(/[12%]/);
    }
  });

  it('reads piped text and keeps its line breaks', async () => {
    const { out } = await runCommand('cowsay', [], { stdin: 'first\nsecond line\n' });
    const lines = out[0].split('\n');
    expect(lines[1]).toBe('/ first       \\');
    expect(lines[2]).toBe('\\ second line /');
  });

  it('reports bad input', async () => {
    expect((await runCommand('cowsay', [])).err[0]).toContain('nothing to say');
    expect((await runCommand('cowsay', ['-f', 'dragon', 'x'])).err[0]).toContain('unknown animal');
    expect((await runCommand('cowsay', ['-z', 'x'])).err[0]).toContain('unknown option');
    expect((await runCommand('cowsay', ['-e'])).err[0]).toContain('needs a value');
    // After `--`, an option-looking word is text.
    expect((await runCommand('cowsay', ['--', '-t'])).out[0]).toContain('< -t >');
  });
});

describe('neofetch', () => {
  const shell = {
    cfg: { user: 'guest', host: 'example.com', version: '9.9.9' },
    capture: async () => ({ ok: true, stdout: "Lud'OS 9.9.9 x86_64 GNU/Terminal", stderr: '' }),
    currentTheme: () => 'amber',
    commands: [{ name: 'ls' }, { name: 'cat' }, { name: 'neofetch' }],
  };

  it('prints the logo beside real browser facts, as plain text', async () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0',
      platform: 'Linux x86_64',
      hardwareConcurrency: 8,
      deviceMemory: 4,
      language: 'en-GB',
    });
    vi.stubGlobal('screen', { width: 1920, height: 1080 });
    vi.stubGlobal('devicePixelRatio', 1.5);
    const { out, err } = await runCommand('neofetch', [], { ctx: shell });
    expect(err).toEqual([]);
    expect(out).toHaveLength(1);
    const text = out[0];
    expect(text).toContain('L u d O S');
    expect(text).toContain('guest@example.com');
    expect(text).toContain("OS: Lud'OS 9.9.9 x86_64 GNU/Terminal");
    expect(text).toContain('Browser: Firefox 130.0 (Gecko)');
    expect(text).toContain('Platform: Linux x86_64');
    expect(text).toContain('Resolution: 1920x1080');
    expect(text).toContain('Pixel ratio: 1.5x');
    expect(text).toContain('CPU: 8 threads');
    expect(text).toContain('Memory: about 4 GB');
    expect(text).toContain('Language: en-GB');
    expect(text).toContain('Theme: amber');
    expect(text).toContain('Packages: 3 (/bin)');
    expect(text).toMatch(/Uptime: \d/);
    expect(text).toContain('███');
    // No DOM here, hence no WebGL: the GPU line is left out, not invented.
    expect(text).not.toContain('GPU');
    expect(text).not.toContain('<span');
  });

  it('prefers client hints and names the product over Chromium', async () => {
    vi.stubGlobal('navigator', {
      userAgent:
        'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
      userAgentData: {
        platform: 'Windows',
        brands: [
          { brand: 'Not?A_Brand', version: '99' },
          { brand: 'Chromium', version: '140' },
          { brand: 'Microsoft Edge', version: '140' },
        ],
      },
    });
    const { out } = await runCommand('neofetch', [], { ctx: shell });
    expect(out[0]).toContain('Browser: Microsoft Edge 140 (Blink)');
    expect(out[0]).toContain('Platform: Windows');
  });

  it('degrades gracefully when the browser exposes nothing', async () => {
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('screen', undefined);
    const bare = {
      cfg: { user: 'guest', host: 'example.com' },
      capture: async () => {
        throw new Error('no shell');
      },
      currentTheme: () => {
        throw new Error('no document');
      },
    };
    const { out, err } = await runCommand('neofetch', [], { ctx: bare });
    expect(err).toEqual([]);
    expect(out[0]).toContain('guest@example.com');
    expect(out[0]).toContain("OS: Lud'OS");
    for (const label of ['Browser', 'Resolution', 'CPU', 'Memory', 'Theme', 'Packages']) {
      expect(out[0]).not.toContain(`${label}:`);
    }
  });
});

describe('yes', () => {
  it('emits a bounded number of lines when captured', async () => {
    const { out } = await runCommand('yes');
    const lines = out[0].split('\n');
    expect(lines).toHaveLength(1000);
    expect(new Set(lines)).toEqual(new Set(['y']));
  });

  it('repeats its arguments joined by spaces', async () => {
    const { out } = await runCommand('yes', ['no', 'way']);
    expect(out[0].split('\n').slice(0, 3)).toEqual(['no way', 'no way', 'no way']);
  });
});

describe('sleep', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  /** Starts `sleep` and reports whether it has finished yet. */
  function startSleep(args: string[], ctx: Record<string, unknown> = {}) {
    const state = { done: false, err: [] as string[] };
    const finished = runCommand('sleep', args, { ctx }).then((result) => {
      state.done = true;
      state.err = result.err;
    });
    return { state, finished };
  }

  it('rejects missing, malformed and oversized durations', async () => {
    expect((await runCommand('sleep', [])).err[0]).toContain('missing operand');
    for (const bad of ['abc', '2h', '-1', '1e3', '']) {
      expect((await runCommand('sleep', [bad])).err[0]).toContain('invalid time interval');
    }
    expect((await runCommand('sleep', ['3601'])).err[0]).toContain('too long');
    expect((await runCommand('sleep', ['61m'])).err[0]).toContain('too long');
  });

  it('really waits for the requested time', async () => {
    const { state, finished } = startSleep(['1.5']);
    await vi.advanceTimersByTimeAsync(1400);
    expect(state.done).toBe(false);
    await vi.advanceTimersByTimeAsync(200);
    await finished;
    expect(state.err).toEqual([]);
  });

  it('adds durations and understands minutes', async () => {
    const { state, finished } = startSleep(['1m', '30s']);
    await vi.advanceTimersByTimeAsync(89_000);
    expect(state.done).toBe(false);
    await vi.advanceTimersByTimeAsync(1_000);
    await finished;
    expect(state.done).toBe(true);
  });

  it('wakes up on Ctrl+C', async () => {
    const controller = new AbortController();
    const { state, finished } = startSleep(['60'], { signal: controller.signal });
    await vi.advanceTimersByTimeAsync(100);
    expect(state.done).toBe(false);
    controller.abort();
    await finished;
    expect(state.done).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('watch', () => {
  const commands = [
    { name: 'top', alias: ['htop'] },
    { name: 'ls', alias: [] },
  ];
  const captureOf = (stdout: string, stderr = '') =>
    vi.fn<(line: string) => Promise<{ ok: boolean; stdout: string; stderr: string }>>(async () => ({
      ok: !stderr,
      stdout,
      stderr,
    }));

  it('validates its arguments', async () => {
    const capture = captureOf('');
    const run = (args: string[]) => runCommand('watch', args, { ctx: { capture, commands } });
    expect((await run([])).err[0]).toContain('no command given');
    expect((await run(['-n', '5'])).err[0]).toContain('no command given');
    expect((await run(['-n', 'soon', 'ls'])).err[0]).toContain('invalid interval');
    expect((await run(['-n'])).err[0]).toContain('invalid interval');
    expect((await run(['-x', 'ls'])).err[0]).toContain('unknown option');
    expect(capture).not.toHaveBeenCalled();
  });

  it('refuses interactive or endless commands, aliases and pipelines included', async () => {
    const capture = captureOf('');
    const run = (args: string[]) => runCommand('watch', args, { ctx: { capture, commands } });
    for (const name of ['watch', 'nano', 'top', 'cmatrix', 'sl', 'glaude', 'su', 'boot']) {
      expect((await run([name])).err[0]).toContain(`refusing to watch '${name}'`);
    }
    expect((await run(['htop'])).err[0]).toContain("refusing to watch 'htop'");
    expect((await run(['ls | nano'])).err[0]).toContain("refusing to watch 'nano'");
    expect((await run(['-n', '1', 'top', '-n', '1'])).err[0]).toContain('refusing');
    expect(capture).not.toHaveBeenCalled();
  });

  it('runs the command once when captured and passes its output on', async () => {
    const capture = captureOf('total 3');
    const { out, err } = await runCommand('watch', ['-n', '5', 'ls', '-la'], {
      ctx: { capture, commands },
    });
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledWith('ls -la');
    expect(out).toEqual(['total 3']);
    expect(err).toEqual([]);
  });

  it('forwards the errors of the watched command', async () => {
    const capture = captureOf('', 'nope: command not found');
    const { err } = await runCommand('watch', ['nope'], { ctx: { capture, commands } });
    expect(err).toEqual(['nope: command not found']);
  });

  it('rebuilds the command line with the quotes the shell removed', async () => {
    const capture = captureOf('');
    await runCommand('watch', ['grep', 'a b', "it's", 'notes'], { ctx: { capture, commands } });
    expect(capture).toHaveBeenCalledWith(`grep 'a b' 'it'"'"'s' notes`);
    // A refused name that is only an argument is fine.
    capture.mockClear();
    await runCommand('watch', ['echo', 'top | nano'], { ctx: { capture, commands } });
    expect(capture).toHaveBeenCalledWith("echo 'top | nano'");
  });
});

describe('curl', () => {
  it('fetches a bare host over https and pretty-prints JSON', async () => {
    const fetchMock = stubJsonFetch({ zen: 'keep it simple', n: 1 });
    const { out, err } = await runCommand('curl', ['example.com/api']);
    expect(err).toEqual([]);
    expect(out).toEqual(['{\n  "zen": "keep it simple",\n  "n": 1\n}']);
    expect(fetchMock.mock.calls[0][0]).toBe('https://example.com/api');
    expect(fetchMock.mock.calls[0][1]?.method).toBe('GET');
  });

  it('prints plain text bodies verbatim', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () => new Response('<h1>Hello</h1>\n', { headers: { 'content-type': 'text/html' } }),
      ),
    );
    expect((await runCommand('curl', ['http://example.com'])).out).toEqual(['<h1>Hello</h1>\n']);
  });

  it('sends HEAD and prints only the headers with -I', async () => {
    const fetchMock = vi.fn<(url: string, options?: RequestInit) => Promise<Response>>(
      async () =>
        new Response(null, {
          status: 200,
          statusText: 'OK',
          headers: { 'content-type': 'text/html', 'cache-control': 'max-age=60' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { out } = await runCommand('curl', ['-sI', 'https://example.com']);
    expect(fetchMock.mock.calls[0][1]?.method).toBe('HEAD');
    const lines = out[0].split('\n');
    expect(lines[0]).toBe('HTTP 200 OK');
    expect(lines).toContain('content-type: text/html');
    expect(lines).toContain('cache-control: max-age=60');
  });

  it('prints headers then the body with -i', async () => {
    stubJsonFetch({ ok: true }, { status: 404, statusText: 'Not Found' });
    const { out } = await runCommand('curl', ['-i', 'example.com']);
    const [head, body] = out[0].split('\n\n');
    expect(head.split('\n')[0]).toBe('HTTP 404 Not Found');
    expect(head).toContain('content-type: application/json');
    expect(body).toBe('{\n  "ok": true\n}');
  });

  it('explains CORS when the browser blocks the request', async () => {
    stubFailingFetch();
    const { out, err } = await runCommand('curl', ['example.com']);
    expect(out).toEqual([]);
    expect(err.join('\n')).toContain('https://example.com/');
    expect(err.join('\n')).toContain('CORS');
    expect(err.join('\n')).toContain('Access-Control-Allow-Origin');
    // -s keeps quiet about it.
    expect((await runCommand('curl', ['-s', 'example.com'])).err).toEqual([]);
  });

  it('names mixed content when an https page fetches http', async () => {
    stubFailingFetch();
    vi.stubGlobal('location', { protocol: 'https:' });
    const { err } = await runCommand('curl', ['http://example.com']);
    expect(err.join('\n')).toContain('mixed content');
  });

  it('refuses anything that is not http(s), and bad usage', async () => {
    const fetchMock = stubJsonFetch({});
    for (const target of ['ftp://example.com', 'mailto:a@example.com', 'javascript:alert(1)']) {
      expect((await runCommand('curl', [target])).err[0]).toContain('unsupported scheme');
    }
    expect((await runCommand('curl', [])).err[0]).toContain('no URL specified');
    expect((await runCommand('curl', ['-X', 'example.com'])).err[0]).toContain('unknown option');
    expect((await runCommand('curl', ['a.example.com', 'b.example.com'])).err[0]).toContain(
      'only one URL',
    );
    expect((await runCommand('curl', ['https://u:p@example.com'])).err[0]).toContain('credentials');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('truncates long bodies to the documented limit, with a note', async () => {
    const big = () =>
      new Response('x'.repeat(70_000), { headers: { 'content-type': 'text/plain' } });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => big()),
    );
    const { out, err } = await runCommand('curl', ['example.com']);
    expect(out[0]).toHaveLength(65_536);
    expect(err[0]).toContain('truncated to the first 65536 bytes');
    const silent = await runCommand('curl', ['-s', 'example.com']);
    expect(silent.out[0]).toHaveLength(65_536);
    expect(silent.err).toEqual([]);
  });

  it('does not print binary content', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('\u0089PNG', { headers: { 'content-type': 'image/png' } })),
    );
    const { out, err } = await runCommand('curl', ['example.com/logo.png']);
    expect(out).toEqual([]);
    expect(err[0]).toContain('binary content (image/png)');
  });
});

describe('dig', () => {
  const answerA = {
    Status: 0,
    TC: false,
    RD: true,
    RA: true,
    AD: true,
    CD: false,
    Question: [{ name: 'example.com.', type: 1 }],
    Answer: [
      { name: 'example.com.', type: 1, TTL: 300, data: '192.0.2.10' },
      { name: 'example.com.', type: 1, TTL: 300, data: '192.0.2.11' },
    ],
  };
  const nxdomain = {
    Status: 3,
    RD: true,
    RA: true,
    Question: [{ name: 'nope.example.', type: 1 }],
    Authority: [
      { name: 'example.', type: 6, TTL: 900, data: 'ns.example. admin.example. 1 2 3 4 5' },
    ],
  };

  it('prints a dig-style report with status, flags, TTL and query time', async () => {
    const fetchMock = stubJsonFetch(answerA);
    const { out, err } = await runCommand('dig', ['example.com']);
    expect(err).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://dns.google/resolve?name=example.com&type=A');
    const report = out[0];
    expect(report).toContain('status: NOERROR');
    expect(report).toContain('flags: rd ra ad');
    expect(report).toContain('answers: 2');
    expect(report).toContain(';; QUESTION');
    expect(report).toMatch(/example\.com\.\s+300\s+IN\s+A\s+192\.0\.2\.10/);
    expect(report).toMatch(/;; Query time: \d+ msec/);
    expect(report).toContain(';; SERVER: dns.google');
    expect(report).not.toContain(';; AUTHORITY');
  });

  it('accepts the type on either side of the name, in any case', async () => {
    const fetchMock = stubJsonFetch({ Status: 0, Answer: [] });
    await runCommand('dig', ['example.com', 'mx']);
    await runCommand('dig', ['TXT', 'example.com.']);
    expect(fetchMock.mock.calls[0][0]).toContain('name=example.com&type=MX');
    expect(fetchMock.mock.calls[1][0]).toContain('name=example.com&type=TXT');
  });

  it('reports NXDOMAIN with the authority section', async () => {
    stubJsonFetch(nxdomain);
    const { out, err } = await runCommand('dig', ['nope.example']);
    expect(err).toEqual([]);
    expect(out[0]).toContain('status: NXDOMAIN');
    expect(out[0]).toContain('answers: 0');
    expect(out[0]).not.toContain(';; ANSWER');
    expect(out[0]).toContain(';; AUTHORITY');
    expect(out[0]).toMatch(/example\.\s+900\s+IN\s+SOA\s+ns\.example\./);
  });

  it('prints only the data with +short', async () => {
    stubJsonFetch(answerA);
    expect((await runCommand('dig', ['example.com', '+short'])).out).toEqual([
      '192.0.2.10\n192.0.2.11',
    ]);
    stubJsonFetch(nxdomain);
    const missing = await runCommand('dig', ['+short', 'nope.example']);
    expect(missing.out).toEqual([]);
    expect(missing.err).toEqual(['dig: nope.example: NXDOMAIN']);
  });

  it('expands ANY into the common types and merges the answers', async () => {
    const fetchMock = stubJsonFetch(answerA);
    const { out } = await runCommand('dig', ['example.com', 'ANY']);
    const asked = fetchMock.mock.calls.map((call) => new URL(call[0]).searchParams.get('type'));
    expect(asked).toEqual(['A', 'AAAA', 'CNAME', 'MX', 'NS', 'TXT', 'SOA', 'CAA']);
    // The same records came back eight times: they are listed once.
    expect(out[0]).toContain('answers: 2');
  });

  it('builds reverse names for -x', async () => {
    const fetchMock = stubJsonFetch({ Status: 0, Answer: [] });
    await runCommand('dig', ['-x', '192.0.2.1']);
    await runCommand('dig', ['-x', '2001:db8::1']);
    const first = new URL(fetchMock.mock.calls[0][0]).searchParams;
    expect(first.get('name')).toBe('1.2.0.192.in-addr.arpa');
    expect(first.get('type')).toBe('PTR');
    expect(new URL(fetchMock.mock.calls[1][0]).searchParams.get('name')).toBe(
      '1.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.8.b.d.0.1.0.0.2.ip6.arpa',
    );
    expect((await runCommand('dig', ['-x', 'example.com'])).err[0]).toContain('not an IP address');
  });

  it('neutralises hostile remote fields', async () => {
    stubJsonFetch({
      Status: 0,
      Answer: [{ name: 'example.com.', type: 'x', TTL: '<b>', data: 'one\n;; ANSWER forged\r' }],
    });
    const { out } = await runCommand('dig', ['example.com', 'TXT']);
    expect(out[0]).not.toContain('\n;; ANSWER forged');
    expect(out[0]).toMatch(/example\.com\.\s+0\s+IN\s+TYPE0\s+one ;; ANSWER forged/);
  });

  it('reports network and resolver failures, and bad usage', async () => {
    stubFailingFetch();
    expect((await runCommand('dig', ['example.com'])).err[0]).toContain(
      'cannot query dns.google (DNS-over-HTTPS): network error',
    );
    stubJsonFetch({}, { status: 500 });
    expect((await runCommand('dig', ['example.com'])).err[0]).toContain('HTTP 500');
    const fetchMock = stubJsonFetch({});
    expect((await runCommand('dig', [])).err[0]).toContain('usage: dig');
    expect((await runCommand('dig', ['example.com', 'BOGUS'])).err[0]).toContain(
      "unknown record type 'BOGUS'",
    );
    expect((await runCommand('dig', ['example.com', '+trace'])).err[0]).toContain('unknown option');
    expect((await runCommand('dig', ['exa mple.com'])).err[0]).toContain('not a valid domain');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('cmatrix', () => {
  it('prints one still frame of rain when captured', async () => {
    const { out, err } = await runCommand('cmatrix');
    expect(err).toEqual([]);
    expect(out).toHaveLength(1);
    const lines = out[0].split('\n');
    expect(lines).toHaveLength(16);
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(60);
      expect(line).toMatch(/^[0-9A-Z:.=*+\-|/#$%@ ]*$/);
    }
    expect(out[0].replace(/\s/g, '').length).toBeGreaterThan(20);
  });

  it('validates its options', async () => {
    expect((await runCommand('cmatrix', ['-z'])).err[0]).toContain('unknown option');
    expect((await runCommand('cmatrix', ['-t'])).err[0]).toContain('-t needs a number');
    expect((await runCommand('cmatrix', ['-t', '0'])).err[0]).toContain('-t needs a number');
    expect((await runCommand('cmatrix', ['-t', '99999'])).err[0]).toContain('-t needs a number');
    expect((await runCommand('cmatrix', ['-t', '5'])).err).toEqual([]);
  });
});
