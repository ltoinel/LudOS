---
name: webllmfit
desc: which in-browser LLMs fit your machine? (à la llmfit.org)
seo_title: Which LLM can my GPU run? In-browser model checker
man: |
  # WEBLLMFIT(1)

  ## NAME
  webllmfit — estimate which WebLLM models can run on this machine

  ## SYNOPSIS
  webllmfit
  webllmfit --all

  ## DESCRIPTION
  Inspired by llmfit.org, but wired to the real WebLLM catalogue. It probes
  this machine's WebGPU capabilities (adapter, shader-f16 support, max
  buffer / storage-buffer sizes) and approximate system memory, then
  cross-references every model's own vram_required_MB and required_features
  to label each one FIT, TIGHT or NO.

  For each model it keeps the build that best matches the GPU (q4f16 when
  shader-f16 is available, otherwise q4f32) and de-duplicates the rest. The
  list is sorted so the largest model you can run comes first.

  Verdicts:
    FIT    comfortably within the estimated memory budget
    TIGHT  fits, but close to the budget — may be slow or fail under load
    NO     too large, or needs a GPU feature you don't have

  The memory budget is an ESTIMATE: browsers don't expose total VRAM, so it
  is derived from navigator.deviceMemory (capped, approximate) with headroom.
  Real-world fit also depends on free VRAM and other GPU load.

  ## OPTIONS
  --all, -a   also list the models that do NOT fit

  ## EXAMPLES
  webllmfit
  webllmfit --all

  ## SEE ALSO
  llm, miaougpt, denree, top
js: |
  // Self-contained "does it fit?" report. Reads the WebLLM model catalogue
  // (each record carries vram_required_MB + required_features) and weighs it
  // against this machine's WebGPU limits and approximate RAM. Estimate only —
  // browsers do not expose total VRAM.
  const E = ctx.escape;
  const showAll = ctx.args.includes('--all') || ctx.args.includes('-a');

  // ---- machine probe (the parts available without WebGPU) ----
  const ramGB =
    navigator && typeof navigator.deviceMemory === 'number' ? navigator.deviceMemory : null;
  const threads = navigator.hardwareConcurrency || null;

  ctx.append(
    '<div class="ln"><span class="accent text-glow">webllmfit</span><span class="comment"> — can your machine run these models?</span></div>',
  );
  ctx.line('');

  // ---- WebGPU gate ----
  if (!('gpu' in navigator) || !navigator.gpu) {
    ctx.line('Hardware');
    ctx.line('  WebGPU.........: NOT available');
    ctx.line('  System RAM.....: ' + (ramGB ? '~' + ramGB + ' GB (approx)' : 'unknown'));
    ctx.line('  CPU threads....: ' + (threads || '?'));
    ctx.line('');
    ctx.error('No WebGPU → no in-browser LLM can run in this browser.');
    ctx.line(
      'Use a recent Chrome/Edge (≥ 113) or Safari 18+ (chrome://flags/#enable-unsafe-webgpu on Linux).',
    );
    return;
  }
  let adapter = null;
  try {
    adapter = await navigator.gpu.requestAdapter();
  } catch {
    /* none */
  }
  if (!adapter) {
    ctx.line('Hardware');
    ctx.line('  WebGPU.........: present, but no usable GPU adapter');
    ctx.line('  System RAM.....: ' + (ramGB ? '~' + ramGB + ' GB (approx)' : 'unknown'));
    ctx.line('  CPU threads....: ' + (threads || '?'));
    ctx.line('');
    ctx.error('No WebGPU adapter → no in-browser LLM can run here.');
    return;
  }

  const hasF16 = !!(
    adapter.features &&
    typeof adapter.features.has === 'function' &&
    adapter.features.has('shader-f16')
  );
  const BYTES_PER_MB = 1048576;
  const limits = adapter.limits || {};
  const maxBufferMB = limits.maxBufferSize ? limits.maxBufferSize / BYTES_PER_MB : 0;
  const maxStorageBufferMB = limits.maxStorageBufferBindingSize
    ? limits.maxStorageBufferBindingSize / BYTES_PER_MB
    : 0;
  let info = {};
  try {
    info =
      adapter.info ||
      (typeof adapter.requestAdapterInfo === 'function' ? await adapter.requestAdapterInfo() : {}) ||
      {};
  } catch {
    /* adapter info is best-effort */
  }

  // Estimated memory budget for the model (weights + KV cache). Browsers don't
  // expose total VRAM; derive it from system RAM with headroom, falling back to
  // a loose GPU proxy. Deliberately conservative — better to under-promise.
  const RAM_SHARE_FOR_MODEL = 0.6; // the rest is left to the OS, the browser and the page
  const MIN_GPU_PROXY_MB = 2048;
  const budgetMB = ramGB
    ? Math.round(ramGB * 1024 * RAM_SHARE_FOR_MODEL)
    : Math.round(Math.max(maxBufferMB, MIN_GPU_PROXY_MB));

  // ---- load the catalogue ----
  ctx.line('loading the model catalogue…');
  // Through the central LLM module (src/lib/llm.ts), the only WebLLM loader.
  let records;
  try {
    records = await ctx.llm.catalog();
  } catch (e) {
    ctx.error('webllmfit: could not load the engine — ' + (e.message || e.name));
    return;
  }

  // ---- de-duplicate quant variants, keep the build best suited to this GPU ----
  // A model id carries its quantization (`…-q4f16_1-MLC`): masking it gives a
  // key shared by every build of the same model.
  const modelFamilyKey = (id) => id.replace(/-q\d+f\d+(_\d+)?/i, '##');
  const families = new Map();
  for (const record of records) {
    const key = modelFamilyKey(record.model_id);
    if (!families.has(key)) families.set(key, []);
    families.get(key).push(record);
  }
  const needsF16 = (record) => (record.required_features || []).includes('shader-f16');
  const vramOf = (record) => record.vram_required_MB || 0;
  // 4-bit weights with 16-bit floats when the GPU supports them (smaller and
  // faster), with 32-bit floats otherwise.
  const preferredQuantization = hasF16 ? 'q4f16' : 'q4f32';
  const chosen = [];
  for (const builds of families.values()) {
    const runnable = builds.filter((record) => !needsF16(record) || hasF16);
    // No build runs on this GPU: keep one anyway, to report it as "NO".
    const pool = runnable.length ? runnable : builds;
    const smallestFirst = pool.slice().sort((a, b) => vramOf(a) - vramOf(b));
    const best =
      pool.find((record) => record.model_id.includes(preferredQuantization)) || smallestFirst[0];
    if (best) chosen.push(best);
  }

  // ---- verdict per model ----
  // Below this share of the budget a model fits comfortably; up to the whole
  // budget it is "tight" (it may load, with little room for anything else).
  const COMFORTABLE_SHARE = 0.8;
  const verdictOf = (record) => {
    if (needsF16(record) && !hasF16) return { verdict: 'NO', why: 'needs shader-f16' };
    const bufferMB = (record.buffer_size_required_bytes || 0) / BYTES_PER_MB;
    if (bufferMB && maxStorageBufferMB && bufferMB > maxStorageBufferMB) {
      return { verdict: 'NO', why: 'buffer > GPU max' };
    }
    const neededMB = vramOf(record);
    if (!neededMB) return { verdict: '?', why: 'unknown size' };
    if (neededMB <= budgetMB * COMFORTABLE_SHARE) return { verdict: 'FIT', why: '' };
    if (neededMB <= budgetMB) return { verdict: 'TIGHT', why: '' };
    return { verdict: 'NO', why: 'not enough memory' };
  };
  // One row per model — { record, verdict, why } — smallest first.
  const rows = chosen
    .map((record) => ({ record, ...verdictOf(record) }))
    .sort((a, b) => vramOf(a.record) - vramOf(b.record));

  // ---- hardware report ----
  const gpuDesc =
    [info.vendor, info.architecture, info.description].filter(Boolean).join(' / ') || 'unknown';
  ctx.line('Hardware');
  ctx.line('  GPU............: ' + gpuDesc);
  ctx.line('  shader-f16.....: ' + (hasF16 ? 'yes (q4f16 builds)' : 'no (q4f32 builds)'));
  ctx.line('  Max buffer.....: ' + Math.round(maxBufferMB) + ' MB');
  ctx.line('  Max storage buf: ' + Math.round(maxStorageBufferMB) + ' MB');
  ctx.line('  System RAM.....: ' + (ramGB ? '~' + ramGB + ' GB (approx)' : 'unknown'));
  ctx.line('  CPU threads....: ' + (threads || '?'));
  ctx.line(
    '  Est. budget....: ~' +
      budgetMB +
      ' MB ' +
      (ramGB ? '(60% of RAM)' : '(GPU proxy)') +
      '  [estimate]',
  );
  ctx.line('');

  // ---- models report ----
  // The verdict, coloured, in a fixed 5-character column ("TIGHT" is the widest).
  const VERDICT_WIDTH = 5;
  const verdictTag = (verdict) => {
    const padded = E(verdict.padEnd(VERDICT_WIDTH).slice(0, VERDICT_WIDTH));
    if (verdict === 'FIT') return '<span class="accent text-glow">' + padded + '</span>';
    if (verdict === 'TIGHT') return '<span style="color:#e0b341">' + padded + '</span>';
    if (verdict === 'NO') return '<span style="color:#ff6b6b">' + padded + '</span>';
    return '<span class="comment">' + padded + '</span>';
  };
  const formatGB = (megabytes) => (megabytes ? (megabytes / 1024).toFixed(1) + ' GB' : '?');
  const printRow = (row) =>
    ctx.append(
      '<div class="ln out">' +
        verdictTag(row.verdict) +
        ' <span class="comment">need ~' +
        E(formatGB(row.record.vram_required_MB)) +
        '</span>  ' +
        '<span class="cmd">' +
        E(row.record.model_id) +
        '</span>' +
        (row.why ? ' <span class="comment">(' + E(row.why) + ')</span>' : '') +
        '</div>',
    );

  const fitRows = rows.filter((row) => row.verdict === 'FIT');
  const tightRows = rows.filter((row) => row.verdict === 'TIGHT');
  const noRows = rows.filter((row) => row.verdict === 'NO' || row.verdict === '?');

  ctx.line(
    'Models  (best build for your GPU: ' + preferredQuantization + ', ' + rows.length + ' distinct)',
  );
  ctx.line('');
  // Largest runnable first, so the most capable model you can use is on top.
  fitRows.slice().reverse().forEach(printRow);
  tightRows.slice().reverse().forEach(printRow);
  if (showAll) noRows.slice().reverse().forEach(printRow);
  ctx.line('');

  // ---- summary ----
  const runnable = fitRows.concat(tightRows);
  if (runnable.length) {
    const biggest = runnable.reduce((largest, row) =>
      vramOf(row.record) > vramOf(largest.record) ? row : largest,
    );
    ctx.append(
      '<div class="ln"><span class="accent text-glow">✓ ' +
        runnable.length +
        ' model(s) can run</span><span class="comment"> — biggest: ' +
        E(biggest.record.model_id) +
        '</span></div>',
    );
    ctx.line('Start one:  llm --load ' + biggest.record.model_id);
  } else {
    ctx.error('No model fits the estimated budget on this machine.');
  }
  if (!showAll && noRows.length)
    ctx.line(noRows.length + ' model(s) do not fit — show them with: webllmfit --all');
  ctx.line('');
  ctx.line('Estimates only — actual fit depends on free VRAM and other GPU load.');
---
