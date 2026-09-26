---
name: dl
desc: download the current directory as a .zip — e.g. dl, dl /etc
alias: download
page: false
man: |
  # DL(1)

  ## NAME
  dl — download a directory of the shell as a zip archive

  ## SYNOPSIS
  dl [-o name.zip] [directory]

  ## DESCRIPTION
  Packs every file and sub-directory of the current directory (or the
  given one) into a .zip archive and hands it to your browser as a
  download. Your own changes — files created with touch, echo … >,
  mkdir — are included. The archive is built entirely in the page: no
  upload, no server.

  Directories you may not read (e.g. /root without su) are skipped.

  ## OPTIONS
  -o <name>   file name of the archive (default: <directory>.zip)

  ## EXAMPLES
  dl
  dl /etc
  dl -o my-notes.zip ~

  ## SEE ALSO
  ls, tree, cat
js: |
  // Self-contained ZIP writer: "stored" entries (no compression — the files
  // are small text), CRC-32 checksums, UTF-8 names. Format: APPNOTE.TXT (PKWARE).

  // ---- arguments ----
  const args = ctx.args.slice();
  let archiveName = '';
  const outIndex = args.indexOf('-o');
  if (outIndex !== -1) {
    archiveName = (args[outIndex + 1] || '').trim();
    args.splice(outIndex, 2);
    if (!archiveName) {
      ctx.error('usage: dl [-o name.zip] [directory]');
      return;
    }
  }
  const target = args[0] || '.';

  // Absolute path of the directory to pack (resolved the same way `cd` does).
  const previous = ctx.cwd();
  const cdError = ctx.cd(target);
  if (cdError) {
    ctx.error(cdError.replace(/^cd:/, 'dl:'));
    return;
  }
  const baseDir = ctx.cwd();
  ctx.cd(previous);

  // ---- collect the files (depth-first) ----
  const joinPath = (dir, name) => (dir === '/' ? `/${name}` : `${dir}/${name}`);
  const entries = []; // { path (relative, with trailing / for dirs), bytes }
  const skipped = [];
  const encoder = new TextEncoder();

  const walk = (absDir, relDir) => {
    const listing = ctx.list(absDir);
    if (listing.error) {
      skipped.push(absDir);
      return;
    }
    for (const entry of listing.entries) {
      const absPath = joinPath(absDir, entry.name);
      const relPath = relDir + entry.name;
      if (entry.type === 'dir') {
        entries.push({ path: `${relPath}/`, bytes: new Uint8Array(0) });
        walk(absPath, `${relPath}/`);
      } else {
        const file = ctx.read(absPath);
        if (file.error) {
          skipped.push(absPath);
        } else {
          entries.push({ path: relPath, bytes: encoder.encode(file.content) });
        }
      }
    }
  };
  walk(baseDir, '');
  if (!entries.length) {
    ctx.error(`dl: ${baseDir} is empty — nothing to download`);
    return;
  }

  // ---- CRC-32 (IEEE 802.3, reflected polynomial 0xEDB88320) ----
  const CRC_TABLE = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    CRC_TABLE[n] = c >>> 0;
  }
  const crc32 = (bytes) => {
    let crc = 0xffffffff;
    for (const byte of bytes) {
      crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  };

  // ---- MS-DOS date/time of "now" (the format ZIP stores) ----
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

  // ---- assemble: local headers + data, then the central directory ----
  const chunks = [];
  const central = [];
  let offset = 0;
  const UTF8_FLAG = 0x0800; // general-purpose bit 11: names are UTF-8

  for (const entry of entries) {
    const name = encoder.encode(entry.path);
    const crc = crc32(entry.bytes);
    const size = entry.bytes.length;

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); // local file header signature
    local.setUint16(4, 20, true); // version needed to extract (2.0)
    local.setUint16(6, UTF8_FLAG, true);
    local.setUint16(8, 0, true); // method 0 = stored
    local.setUint16(10, dosTime, true);
    local.setUint16(12, dosDate, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, size, true); // compressed size
    local.setUint32(22, size, true); // uncompressed size
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true); // extra field length
    chunks.push(new Uint8Array(local.buffer), name, entry.bytes);

    const record = new DataView(new ArrayBuffer(46));
    record.setUint32(0, 0x02014b50, true); // central directory signature
    record.setUint16(4, 20, true); // version made by
    record.setUint16(6, 20, true); // version needed to extract
    record.setUint16(8, UTF8_FLAG, true);
    record.setUint16(10, 0, true); // method: stored
    record.setUint16(12, dosTime, true);
    record.setUint16(14, dosDate, true);
    record.setUint32(16, crc, true);
    record.setUint32(20, size, true);
    record.setUint32(24, size, true);
    record.setUint16(28, name.length, true);
    // 30: extra length, 32: comment length, 34: disk, 36: internal attrs — all 0
    const isDir = entry.path.endsWith('/');
    record.setUint32(38, isDir ? 0x10 : 0, true); // external attrs: MS-DOS directory bit
    record.setUint32(42, offset, true); // offset of the local header
    central.push(new Uint8Array(record.buffer), name);

    offset += 30 + name.length + size;
  }

  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); // end of central directory signature
  end.setUint16(8, entries.length, true); // entries on this disk
  end.setUint16(10, entries.length, true); // total entries
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true); // central directory offset
  const blob = new Blob([...chunks, ...central, new Uint8Array(end.buffer)], {
    type: 'application/zip',
  });

  // ---- hand it to the browser as a download ----
  const folder = baseDir === '/' ? 'root' : baseDir.split('/').pop();
  const fileName = archiveName || `${folder}.zip`;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName.endsWith('.zip') ? fileName : `${fileName}.zip`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);

  const fileCount = entries.filter((e) => !e.path.endsWith('/')).length;
  const kib = (blob.size / 1024).toFixed(1);
  ctx.line(`⬇ ${link.download} — ${fileCount} file(s), ${kib} KiB`);
  if (skipped.length) {
    ctx.sysLine(`skipped (permission denied): ${skipped.join(', ')}`);
  }
---
